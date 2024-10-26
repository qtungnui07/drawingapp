import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import rough from "roughjs/bundled/rough.esm";
import DrawingBoard from './DrawingBoard';
// import {
//   createElement,
//   isPointNearEraser,
//   getElementAtPosition,
//   adjustElementCoordinates,
//   cursorForPosition,
//   resizedCoordinates,
//   drawElement,
//   adjustmentRequired,
//   calculateBoundsForElements,
// } from './element-utils';
import { createMouseHandlers } from './handleMouse';
import {
  createElement,
  drawElement,
  calculateBoundsForElements,
} from './element-utils';

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

const App = () => {
  const [elements, setElements, undo, redo] = useHistory([]);
  const [action, setAction] = useState("none");
  const [tool, setTool] = useState("rectangle");
  const [selectedElement, setSelectedElement] = useState(null);
  const [panOffset, setPanOffset] = React.useState({ x: 0, y: 0 });
  const [startPanMousePosition, setStartPanMousePosition] = React.useState({ x: 0, y: 0 });
  const [scale, setScale] = React.useState(1);
  const [scaleOffset, setScaleOffset] = React.useState({ x: 0, y: 0 });
  const [captureArea, setCaptureArea] = useState(null);
  const textAreaRef = useRef();
  const pressedKeys = usePressedKeys();
  const [eraserSize, setEraserSize] = useState(10);
  const [pencilSize, setPencilSize] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const idleTimerRef = useRef(null);
  const lastDrawTimeRef = useRef(null);
  const [drawingRegions, setDrawingRegions] = useState([]);
  const [currentRegionElements, setCurrentRegionElements] = useState([]);
  const lastElementIndexRef = useRef(0);

  
  const calculateDrawnArea = () => {
    if (elements.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    elements.forEach(element => {
      if (element.type === "text") {
        // For text elements
        minX = Math.min(minX, element.x1);
        minY = Math.min(minY, element.y1);
        maxX = Math.max(maxX, element.x2);
        maxY = Math.max(maxY, element.y2);
      } else if (element.type === "pencil") {
        // For pencil strokes
        element.points.forEach(point => {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        });
      } else if (element.type === "line" || element.type === "rectangle") {
        // For lines and rectangles
        minX = Math.min(minX, element.x1, element.x2);
        minY = Math.min(minY, element.y1, element.y2);
        maxX = Math.max(maxX, element.x1, element.x2);
        maxY = Math.max(maxY, element.y1, element.y2);
      }
    });

    // Add padding
    const padding = 20;
    return {
      x1: minX - padding,
      y1: minY - padding,
      x2: maxX + padding,
      y2: maxY + padding,
    };
  };
  const handleIdle = () => {
    if (lastDrawTimeRef.current && currentRegionElements.length > 0) {
      const newRegion = {
        id: drawingRegions.length + 1,
        bounds: calculateBoundsForElements(currentRegionElements),
        elements: [...currentRegionElements]
      };
      
      console.log(`Phát hiện vùng vẽ số ${newRegion.id}!`);
      alert(`Đã phát hiện vùng vẽ số ${newRegion.id}!`);
      
      setDrawingRegions(prev => [...prev, newRegion]);
      setCurrentRegionElements([]);
      lastDrawTimeRef.current = null;
      lastElementIndexRef.current = elements.length;
    }
  };
  const resetIdleTimer = () => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    
    lastDrawTimeRef.current = Date.now();
    idleTimerRef.current = setTimeout(handleIdle, 2000); // 2 seconds
  };
  useLayoutEffect(() => {
    const canvas = document.getElementById("canvas");
    const context = canvas.getContext("2d");
    const roughCanvas = rough.canvas(canvas);

    context.clearRect(0, 0, canvas.width, canvas.height);

    const scaledWidth = canvas.width * scale;
    const scaledHeight = canvas.height * scale;

    const scaleOffsetX = (scaledWidth - canvas.width) / 2;
    const scaleOffsetY = (scaledHeight - canvas.height) / 2;
    setScaleOffset({ x: scaleOffsetX, y: scaleOffsetY });

    context.save();
    context.translate(panOffset.x * scale - scaleOffsetX, panOffset.y * scale - scaleOffsetY);
    context.scale(scale, scale);

    // Vẽ tất cả elements
    elements.forEach(element => {
      if (action === "writing" && selectedElement?.id === element.id) return;
      drawElement(roughCanvas, context, element);
    });

    // Vẽ các vùng đã được xác định với số thứ tự
    drawingRegions.forEach(region => {
      const { bounds, id } = region;
      context.strokeStyle = "#0099ff";
      context.lineWidth = 1 / scale;
      context.setLineDash([5 / scale, 5 / scale]);
      context.strokeRect(
        bounds.x1,
        bounds.y1,
        bounds.x2 - bounds.x1,
        bounds.y2 - bounds.y1
      );
      
      // Vẽ số thứ tự
      context.setLineDash([]);
      context.font = `${16 / scale}px sans-serif`;
      context.fillStyle = "#0099ff";
      context.fillText(
        `#${id}`,
        bounds.x1 + 5 / scale,
        bounds.y1 + 20 / scale
      );
    });

    // Vẽ vùng hiện tại nếu có elements mới
    if (currentRegionElements.length > 0) {
      const currentBounds = calculateBoundsForElements(currentRegionElements);
      if (currentBounds) {
        context.strokeStyle = "#00ff00";
        context.lineWidth = 1 / scale;
        context.setLineDash([5 / scale, 5 / scale]);
        context.strokeRect(
          currentBounds.x1,
          currentBounds.y1,
          currentBounds.x2 - currentBounds.x1,
          currentBounds.y2 - currentBounds.y1
        );
      }
    }

    context.restore();
  }, [elements, action, selectedElement, panOffset, scale, drawingRegions, currentRegionElements]);
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
    const newElements = elements.slice(lastElementIndexRef.current);
    if (newElements.length > 0) {
      setCurrentRegionElements(prev => [...prev, ...newElements]);
    }
  }, [elements]);
  useEffect(() => {
    const panOrZoomFunction = event => {
      if (pressedKeys.has("Meta") || pressedKeys.has("Control")) onZoom(event.deltaY * -0.01);
      setPanOffset(prevState => ({
        x: prevState.x - event.deltaX,
        y: prevState.y - event.deltaY,
      }));
    };

    document.addEventListener("wheel", panOrZoomFunction);
    return () => {
      document.removeEventListener("wheel", panOrZoomFunction);
    };
  }, [pressedKeys]);

  useEffect(() => {
    const textArea = textAreaRef.current;
    if (action === "writing") {
      setTimeout(() => {
        textArea.focus();
        textArea.value = selectedElement.text;
      }, 0);
    }
  }, [action, selectedElement]);
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, []);
  const captureDrawnArea = () => {
    if (elements.length === 0) {
      alert("No elements to capture");
      return;
    }
  
    const bounds = calculateDrawnArea();
    if (!bounds) return;
  
    const canvas = document.getElementById("canvas");
    const context = canvas.getContext("2d");
  
    // Create temporary canvas
    const tempCanvas = document.createElement("canvas");
    const tempContext = tempCanvas.getContext("2d");
  
    // Calculate actual dimensions based on scale
    const width = Math.abs(bounds.x2 - bounds.x1);
    const height = Math.abs(bounds.y2 - bounds.y1);
  
    // Set temporary canvas size - use original size without scale
    tempCanvas.width = width;
    tempCanvas.height = height;
  
    // Fill with white background
    tempContext.fillStyle = '#ffffff';
    tempContext.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  
    // Apply transformations to match the main canvas
    tempContext.save();
    
    // Adjust translation to account for bounds offset
    tempContext.translate(-bounds.x1, -bounds.y1);
    
    // Draw all elements at original scale
    const roughCanvas = rough.canvas(tempCanvas);
    elements.forEach(element => {
      drawElement(roughCanvas, tempContext, element);
    });
  
    tempContext.restore();
  
    // Create download link
    const link = document.createElement("a");
    link.download = "drawn-area.jpeg";
    link.href = tempCanvas.toDataURL("image/jpeg", 0.8);
    link.click();
  
    return bounds;
  };
 
  const onZoom = delta=>{
    setScale(prevState => Math.min(Math.max(prevState + delta, 0.1),2)); 

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
    resetIdleTimer,
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
      captureDrawnArea={captureDrawnArea}
    />
  );
};

export default App;