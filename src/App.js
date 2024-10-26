import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import rough from "roughjs/bundled/rough.esm";
import DrawingBoard from './DrawingBoard';
import {
  createElement,
  drawElement
} from './element-utils';
import { createMouseHandlers } from './handleMouse';

// Region detection helper functions
const getPixel = (imageData, x, y) => {
  const index = (y * imageData.width + x) * 4;
  return {
    r: imageData.data[index],
    g: imageData.data[index + 1],
    b: imageData.data[index + 2],
    a: imageData.data[index + 3]
  };
};

const isPixelNonTransparent = (pixel) => {
  return pixel.a > 0;
};

const isWithinBounds = (x, y, width, height) => {
  return x >= 0 && x < width && y >= 0 && y < height;
};

const floodFill = (imageData, startX, startY, visited) => {
  const width = imageData.width;
  const height = imageData.height;
  const queue = [[startX, startY]];
  const region = {
    points: [],
    minX: startX,
    maxX: startX,
    minY: startY,
    maxY: startY
  };

  while (queue.length > 0) {
    const [x, y] = queue.shift();
    const key = `${x},${y}`;

    if (visited.has(key)) continue;
    
    const pixel = getPixel(imageData, x, y);
    if (!isPixelNonTransparent(pixel)) continue;

    visited.add(key);
    region.points.push({ x, y });
    region.minX = Math.min(region.minX, x);
    region.maxX = Math.max(region.maxX, x);
    region.minY = Math.min(region.minY, y);
    region.maxY = Math.max(region.maxY, y);

    // Check 8 neighboring pixels
    const neighbors = [
      [x + 1, y], [x - 1, y],
      [x, y + 1], [x, y - 1],
      [x + 1, y + 1], [x - 1, y - 1],
      [x + 1, y - 1], [x - 1, y + 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (isWithinBounds(nx, ny, width, height) && !visited.has(`${nx},${ny}`)) {
        queue.push([nx, ny]);
      }
    }
  }

  return region;
};

const calculateRegionDistance = (region1, region2) => {
  const xOverlap = !(region1.maxX < region2.minX || region1.minX > region2.maxX);
  const yOverlap = !(region1.maxY < region2.minY || region1.minY > region2.maxY);
  
  if (xOverlap && yOverlap) return 0;

  let dx = 0;
  let dy = 0;

  if (!xOverlap) {
    dx = Math.min(
      Math.abs(region1.maxX - region2.minX),
      Math.abs(region1.minX - region2.maxX)
    );
  }

  if (!yOverlap) {
    dy = Math.min(
      Math.abs(region1.maxY - region2.minY),
      Math.abs(region1.minY - region2.maxY)
    );
  }

  return Math.sqrt(dx * dx + dy * dy);
};

const mergeRegions = (region1, region2) => {
  return {
    points: [...region1.points, ...region2.points],
    minX: Math.min(region1.minX, region2.minX),
    maxX: Math.max(region1.maxX, region2.maxX),
    minY: Math.min(region1.minY, region2.minY),
    maxY: Math.max(region1.maxY, region2.maxY)
  };
};

const detectRegions = (canvas, minRegionSize = 100, groupingDistance = 80) => {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const visited = new Set();
  let initialRegions = [];

  // First pass: Detect initial regions using flood fill
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const key = `${x},${y}`;
      if (visited.has(key)) continue;

      const pixel = getPixel(imageData, x, y);
      if (!isPixelNonTransparent(pixel)) continue;

      const region = floodFill(imageData, x, y, visited);
      if (region.points.length >= minRegionSize) {
        initialRegions.push(region);
      }
    }
  }

  // Second pass: Merge nearby regions
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < initialRegions.length; i++) {
      for (let j = i + 1; j < initialRegions.length; j++) {
        const distance = calculateRegionDistance(initialRegions[i], initialRegions[j]);
        
        if (distance <= groupingDistance) {
          const mergedRegion = mergeRegions(initialRegions[i], initialRegions[j]);
          initialRegions.splice(j, 1);
          initialRegions[i] = mergedRegion;
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }

  // Convert regions to the format expected by the application
  return initialRegions.map((region, index) => ({
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
    
    // Create a temporary canvas to draw all elements
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext("2d");
    const roughCanvas = rough.canvas(tempCanvas);

    // Draw all elements on temporary canvas
    elements.forEach(element => {
      drawElement(roughCanvas, tempCtx, element);
    });

    // Detect regions
    const newRegions = detectRegions(tempCanvas);
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