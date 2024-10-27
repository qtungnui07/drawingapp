import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import rough from "roughjs/bundled/rough.esm";
import DrawingBoard from './DrawingBoard';
import {
  createElement,
  drawElement
} from './element-utils';
import { createMouseHandlers } from './handleMouse';


const isPixelNonTransparent = (pixel) => {
  return pixel.a > 0;
};

const isWithinBounds = (x, y, width, height) => {
  return x >= 0 && x < width && y >= 0 && y < height;
};

const getPixel = (imageData, x, y) => {
  const index = (y * imageData.width + x) * 4;
  return imageData.data[index + 3] > 0; // Only check alpha channel for performance
};

// Use Set for faster lookups and Int32Array for coordinates
const floodFill = (imageData, startX, startY, visited) => {
  const width = imageData.width;
  const height = imageData.height;
  const queue = new Int32Array(width * height * 2); // Pre-allocate queue
  let queueStart = 0;
  let queueEnd = 2;
  queue[0] = startX;
  queue[1] = startY;

  const region = {
    points: [],
    minX: startX,
    maxX: startX,
    minY: startY,
    maxY: startY
  };

  // Optimize bounds checking
  const isWithinBounds = (x, y) => x >= 0 && x < width && y >= 0 && y < height;

  // Pre-calculate neighbor offsets
  const neighborOffsets = [
    [1, 0], [-1, 0],
    [0, 1], [0, -1],
    [1, 1], [-1, -1],
    [1, -1], [-1, 1]
  ];

  while (queueStart < queueEnd) {
    const x = queue[queueStart];
    const y = queue[queueStart + 1];
    queueStart += 2;

    const key = `${x},${y}`;
    if (visited.has(key)) continue;

    if (!getPixel(imageData, x, y)) continue;

    visited.add(key);
    region.points.push({ x, y });
    
    // Use Math.min/max for bounds tracking
    region.minX = Math.min(region.minX, x);
    region.maxX = Math.max(region.maxX, x);
    region.minY = Math.min(region.minY, y);
    region.maxY = Math.max(region.maxY, y);

    // Check neighbors using pre-calculated offsets
    for (const [dx, dy] of neighborOffsets) {
      const nx = x + dx;
      const ny = y + dy;
      if (isWithinBounds(nx, ny) && !visited.has(`${nx},${ny}`)) {
        queue[queueEnd] = nx;
        queue[queueEnd + 1] = ny;
        queueEnd += 2;
      }
    }
  }

  return region;
};

// Optimize distance calculation
const calculateRegionDistance = (region1, region2) => {
  // Quick overlap check
  const xOverlap = !(region1.maxX < region2.minX || region1.minX > region2.maxX);
  const yOverlap = !(region1.maxY < region2.minY || region1.minY > region2.maxY);
  
  if (xOverlap && yOverlap) return 0;

  // Calculate distance only when necessary
  const dx = !xOverlap ? Math.min(
    Math.abs(region1.maxX - region2.minX),
    Math.abs(region1.minX - region2.maxX)
  ) : 0;

  const dy = !yOverlap ? Math.min(
    Math.abs(region1.maxY - region2.minY),
    Math.abs(region1.minY - region2.maxY)
  ) : 0;

  return Math.sqrt(dx * dx + dy * dy);
};

// Optimize region merging using Set
const mergeRegions = (region1, region2) => ({
  points: [...region1.points, ...region2.points],
  minX: Math.min(region1.minX, region2.minX),
  maxX: Math.max(region1.maxX, region2.maxX),
  minY: Math.min(region1.minY, region2.minY),
  maxY: Math.max(region1.maxY, region2.maxY)
});

const detectRegions = (canvas, elements, panOffset, scale, scaleOffset, minRegionSize = 100, groupingDistance = 80) => {
  // Calculate bounds only once
  const bounds = elements.reduce((acc, element) => {
    if (element.type === 'pencil') {
      element.points.forEach(point => {
        acc.minX = Math.min(acc.minX, point.x);
        acc.minY = Math.min(acc.minY, point.y);
        acc.maxX = Math.max(acc.maxX, point.x);
        acc.maxY = Math.max(acc.maxY, point.y);
      });
    } else {
      const { x1, y1, x2, y2 } = element;
      acc.minX = Math.min(acc.minX, x1, x2);
      acc.minY = Math.min(acc.minY, y1, y2);
      acc.maxX = Math.max(acc.maxX, x1, x2);
      acc.maxY = Math.max(acc.maxY, y1, y2);
    }
    return acc;
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

  // Add padding
  const padding = 100;
  bounds.minX -= padding;
  bounds.minY -= padding;
  bounds.maxX += padding;
  bounds.maxY += padding;

  // Create optimized temporary canvas
  const tempCanvas = document.createElement("canvas");
  const width = Math.max(bounds.maxX - bounds.minX, canvas.width);
  const height = Math.max(bounds.maxY - bounds.minY, canvas.height);
  tempCanvas.width = width * scale;
  tempCanvas.height = height * scale;
  
  // Use OffscreenCanvas when available for better performance
  const ctx = tempCanvas.getContext("2d", { alpha: true });
  const roughCanvas = rough.canvas(tempCanvas);

  // Draw elements with transformation
  ctx.save();
  ctx.translate(-bounds.minX * scale, -bounds.minY * scale);
  ctx.scale(scale, scale);
  elements.forEach(element => drawElement(roughCanvas, ctx, element));
  ctx.restore();

  // Process image data
  const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const visited = new Set();
  const initialRegions = [];

  // Optimize pixel scanning with stride
  const stride = 4; // Check every 4th pixel initially
  for (let y = 0; y < tempCanvas.height; y += stride) {
    for (let x = 0; x < tempCanvas.width; x += stride) {
      const key = `${x},${y}`;
      if (visited.has(key)) continue;

      if (!getPixel(imageData, x, y)) continue;

      const region = floodFill(imageData, x, y, visited);
      if (region.points.length >= minRegionSize) {
        // Transform coordinates back
        const transformedRegion = {
          ...region,
          minX: region.minX / scale + bounds.minX,
          maxX: region.maxX / scale + bounds.minX,
          minY: region.minY / scale + bounds.minY,
          maxY: region.maxY / scale + bounds.minY,
          points: region.points.map(point => ({
            x: point.x / scale + bounds.minX,
            y: point.y / scale + bounds.minY
          }))
        };
        initialRegions.push(transformedRegion);
      }
    }
  }

  // Optimize region merging
  const mergedRegions = [];
  const used = new Set();

  for (let i = 0; i < initialRegions.length; i++) {
    if (used.has(i)) continue;
    
    let currentRegion = initialRegions[i];
    used.add(i);

    let merged;
    do {
      merged = false;
      for (let j = 0; j < initialRegions.length; j++) {
        if (used.has(j)) continue;
        
        const distance = calculateRegionDistance(currentRegion, initialRegions[j]);
        if (distance <= groupingDistance) {
          currentRegion = mergeRegions(currentRegion, initialRegions[j]);
          used.add(j);
          merged = true;
        }
      }
    } while (merged);

    mergedRegions.push(currentRegion);
  }

  // Return final regions
  return mergedRegions.map((region, index) => ({
    id: index + 1,
    bounds: {
      x1: region.minX,
      y1: region.minY,
      x2: region.maxX,
      y2: region.maxY
    },
    elements: []
  }));
};

const useHistory = initialState => {
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState([initialState]);

  const setState = (action, overwrite = false) => {
    const newState = typeof action === "function" ? action(history[index]) : action;
    if (overwrite) {
      const historyCopy = [...history];
      historyCopy[index] = newState;
      setHistory(historyCopy);
    } else {
      const updatedState = [...history].slice(0, index + 1);
      setHistory([...updatedState, newState]);
      setIndex(prevState => prevState + 1);
    }
  };

  const undo = () => index > 0 && setIndex(prevState => prevState - 1);
  const redo = () => index < history.length - 1 && setIndex(prevState => prevState + 1);

  return [history[index], setState, undo, redo];
};

const usePressedKeys = () => {
  const [pressedKeys, setPressedKeys] = useState(new Set());

  useEffect(() => {
    const handleKeyDown = event => {
      setPressedKeys(prevKeys => new Set(prevKeys).add(event.key));
    };

    const handleKeyUp = event => {
      setPressedKeys(prevKeys => {
        const updatedKeys = new Set(prevKeys);
        updatedKeys.delete(event.key);
        return updatedKeys;
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return pressedKeys;
};
const drawBoundingBoxes = (context, regions, scale) => {
  context.save();
  regions.forEach(region => {
    const { bounds, id } = region;
    
    // Set styling for bounding box
    context.strokeStyle = "#FF5733";  // Custom color for better visibility
    context.lineWidth = 1 / scale;
    context.setLineDash([5 / scale, 5 / scale]);  // Dotted lines for bounding box

    // Draw bounding box
    context.strokeRect(
      bounds.x1,
      bounds.y1,
      bounds.x2 - bounds.x1,
      bounds.y2 - bounds.y1
    );

    // Display region ID inside bounding box
    context.setLineDash([]);  // Reset line dash for text
    context.font = `${16 / scale}px sans-serif`;
    context.fillStyle = "#FF5733";
    context.fillText(
      `#${id}`,
      bounds.x1 + 5 / scale,
      bounds.y1 + 20 / scale
    );
  });
  context.restore();
};

const App = () => {
  const [elements, setElements, undo, redo] = useHistory([]);
  const [action, setAction] = useState("none");
  const [tool, setTool] = useState("rectangle");
  const [selectedElement, setSelectedElement] = useState(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [startPanMousePosition, setStartPanMousePosition] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [scaleOffset, setScaleOffset] = useState({ x: 0, y: 0 });
  const [captureArea, setCaptureArea] = useState(null);
  const [drawingRegions, setDrawingRegions] = useState([]);
  const textAreaRef = useRef();
  const pressedKeys = usePressedKeys();
  const [pencilSize, setPencilSize] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const handleDetectRegions = () => {
    const canvas = document.getElementById("canvas");
    if (!canvas) return;
    
    const newRegions = detectRegions(canvas, elements, panOffset, scale, scaleOffset);
    setDrawingRegions(newRegions);
  
    // Notify user
    if (newRegions.length > 0) {
      console.log(`Phát hiện ${newRegions.length} vùng vẽ!`);
      alert(`Đã phát hiện ${newRegions.length} vùng vẽ!`);
    } else {
      alert("Không phát hiện được vùng vẽ nào!");
    }
  };
  useLayoutEffect(() => {
    const canvas = document.getElementById("canvas");
    const context = canvas.getContext("2d");
    const roughCanvas = rough.canvas(canvas);
  
    // Clear canvas for redrawing
    context.clearRect(0, 0, canvas.width, canvas.height);
  
    // Calculate scaled dimensions
    const scaledWidth = canvas.width * scale;
    const scaledHeight = canvas.height * scale;
    const scaleOffsetX = (scaledWidth - canvas.width) / 2;
    const scaleOffsetY = (scaledHeight - canvas.height) / 2;
    setScaleOffset({ x: scaleOffsetX, y: scaleOffsetY });
  
    context.save();
    context.translate(panOffset.x * scale - scaleOffsetX, panOffset.y * scale - scaleOffsetY);
    context.scale(scale, scale);
  
    // Draw elements
    elements.forEach(element => {
      if (action === "writing" && selectedElement?.id === element.id) return;
      drawElement(roughCanvas, context, element);
    });
  
    // Call drawBoundingBoxes to render detected regions
    drawBoundingBoxes(context, drawingRegions, scale);
  
    context.restore();
  }, [elements, action, selectedElement, panOffset, scale, drawingRegions]);
  

  useEffect(() => {
    const undoRedoFunction = event => {
      if ((event.metaKey || event.ctrlKey) && event.key === "z") {
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };

    document.addEventListener("keydown", undoRedoFunction);
    return () => {
      document.removeEventListener("keydown", undoRedoFunction);
    };
  }, [undo, redo]);
  useEffect(() => {
    const panOrZoomFunction = event => {
      if (pressedKeys.has("Meta") || pressedKeys.has("Control")) {
        onZoom(event.deltaY * -0.01);
      } else {
        setPanOffset(prevState => ({
          x: prevState.x - event.deltaX,
          y: prevState.y - event.deltaY,
        }));
      }
    };
  
    document.addEventListener("wheel", panOrZoomFunction);
    return () => {
      document.removeEventListener("wheel", panOrZoomFunction);
    };
  }, [pressedKeys]);
  const onZoom = delta => {
    setScale(prevState => Math.min(Math.max(prevState + delta, 0.1), 2));
  };

  const {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleBlur
  } = createMouseHandlers({
    action,
    setAction,
    tool,
    setTool,
    elements,
    setElements,
    selectedElement,
    setSelectedElement,
    panOffset,
    setPanOffset,
    scale,
    scaleOffset,
    startPanMousePosition,
    setStartPanMousePosition,
    pressedKeys,
    pencilSize,
    setCaptureArea,
    isDrawing,
    setIsDrawing
  });

  return (
    
    <DrawingBoard
      tool={tool}
      setTool={setTool}
      elements={elements}
      pencilSize={pencilSize}
      setPencilSize={setPencilSize}
      scale={scale}
      setScale={setScale}
      onZoom={onZoom}
      undo={undo}
      redo={redo}
      action={action}
      selectedElement={selectedElement}
      panOffset={panOffset}
      scaleOffset={scaleOffset}
      handleMouseDown={handleMouseDown}
      handleMouseMove={handleMouseMove}
      handleMouseUp={handleMouseUp}
      handleBlur={handleBlur}
      handleDetectRegions={handleDetectRegions}
    />
  );
};

export default App;