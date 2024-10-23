import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import rough from "roughjs/bundled/rough.esm";
import getStroke from "perfect-freehand";

const generator = rough.generator();

const createElement = (id, x1, y1, x2, y2, type, pencilSize = 3) => {
  switch (type) {
    case "line":
    case "rectangle":
      const roughElement =
        type === "line"
          ? generator.line(x1, y1, x2, y2)
          : generator.rectangle(x1, y1, x2 - x1, y2 - y1);
      return { id, x1, y1, x2, y2, type, roughElement };
    case "pencil":
      return { id, type, points: [{ x: x1, y: y1, isErased: false }], size: pencilSize };
    case "text":
      return { id, type, x1, y1, x2, y2, text: "" };
    case "capture":
      return { id, type, x1, y1, x2, y2 };
    default:
      throw new Error(`Type not recognised: ${type}`);
  }
};
const isPointNearEraser = (x, y, eraserX, eraserY, eraserSize) => {
  const distance = Math.sqrt(Math.pow(x - eraserX, 2) + Math.pow(y - eraserY, 2));
  return distance <= eraserSize;
};

const nearPoint = (x, y, x1, y1, name) => {
  return Math.abs(x - x1) < 5 && Math.abs(y - y1) < 5 ? name : null;
};

const onLine = (x1, y1, x2, y2, x, y, maxDistance = 1) => {
  const a = { x: x1, y: y1 };
  const b = { x: x2, y: y2 };
  const c = { x, y };
  const offset = distance(a, b) - (distance(a, c) + distance(b, c));
  return Math.abs(offset) < maxDistance ? "inside" : null;
};

const positionWithinElement = (x, y, element) => {
  const { type, x1, x2, y1, y2 } = element;
  switch (type) {
    case "line":
      const on = onLine(x1, y1, x2, y2, x, y);
      const start = nearPoint(x, y, x1, y1, "start");
      const end = nearPoint(x, y, x2, y2, "end");
      return start || end || on;
    case "rectangle":
      const topLeft = nearPoint(x, y, x1, y1, "tl");
      const topRight = nearPoint(x, y, x2, y1, "tr");
      const bottomLeft = nearPoint(x, y, x1, y2, "bl");
      const bottomRight = nearPoint(x, y, x2, y2, "br");
      const inside = x >= x1 && x <= x2 && y >= y1 && y <= y2 ? "inside" : null;
      return topLeft || topRight || bottomLeft || bottomRight || inside;
    case "pencil":
      const betweenAnyPoint = element.points.some((point, index) => {
        const nextPoint = element.points[index + 1];
        if (!nextPoint) return false;
        return onLine(point.x, point.y, nextPoint.x, nextPoint.y, x, y, 5) != null;
      });
      return betweenAnyPoint ? "inside" : null;
    case "text":
      return x >= x1 && x <= x2 && y >= y1 && y <= y2 ? "inside" : null;
    default:
      throw new Error(`Type not recognised: ${type}`);
  }
};

const distance = (a, b) => Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

const getElementAtPosition = (x, y, elements) => {
  return elements
    .map(element => ({ ...element, position: positionWithinElement(x, y, element) }))
    .find(element => element.position !== null);
};

const adjustElementCoordinates = element => {
  const { type, x1, y1, x2, y2 } = element;
  if (type === "rectangle") {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    return { x1: minX, y1: minY, x2: maxX, y2: maxY };
  } else {
    if (x1 < x2 || (x1 === x2 && y1 < y2)) {
      return { x1, y1, x2, y2 };
    } else {
      return { x1: x2, y1: y2, x2: x1, y2: y1 };
    }
  }
};

const cursorForPosition = position => {
  switch (position) {
    case "tl":
    case "br":
    case "start":
    case "end":
      return "nwse-resize";
    case "tr":
    case "bl":
      return "nesw-resize";
    default:
      return "move";
  }
};

const resizedCoordinates = (clientX, clientY, position, coordinates) => {
  const { x1, y1, x2, y2 } = coordinates;
  switch (position) {
    case "tl":
    case "start":
      return { x1: clientX, y1: clientY, x2, y2 };
    case "tr":
      return { x1, y1: clientY, x2: clientX, y2 };
    case "bl":
      return { x1: clientX, y1, x2, y2: clientY };
    case "br":
    case "end":
      return { x1, y1, x2: clientX, y2: clientY };
    default:
      return null; //should not really get here...
  }
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

const getSvgPathFromStroke = stroke => {
  if (!stroke.length) return "";

  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...stroke[0], "Q"]
  );

  d.push("Z");
  return d.join(" ");
};

const drawElement = (roughCanvas, context, element) => {
  switch (element.type) {
    case "line":
    case "rectangle":
      roughCanvas.draw(element.roughElement);
      break;
    case "pencil":
      // Filter out erased points and create segments
      const nonErasedSegments = [];
      let currentSegment = [];
      
      element.points.forEach((point, index) => {
        if (!point.isErased) {
          currentSegment.push([point.x, point.y]);
        } else if (currentSegment.length > 0) {
          nonErasedSegments.push([...currentSegment]);
          currentSegment = [];
        }
      });
      
      if (currentSegment.length > 0) {
        nonErasedSegments.push(currentSegment);
      }

      // Draw each non-erased segment
      nonErasedSegments.forEach(segment => {
        if (segment.length > 1) {
          const stroke = getSvgPathFromStroke(getStroke(segment, {
            size: element.size || 3,
            thinning: 0.5,
            smoothing: 0.5,
            streamline: 0.5,
          }));
          context.fillStyle = '#000';
          context.fill(new Path2D(stroke));
        }
      });
      break;
    case "text":
      context.textBaseline = "top";
      context.font = "24px sans-serif";
      context.fillText(element.text, element.x1, element.y1);
      break;
    case "capture":
      // Draw a semi-transparent rectangle for the capture area
      context.save();
      context.strokeStyle = "#000000";
      context.setLineDash([5, 5]); // Create dashed line
      context.lineWidth = 1;
      context.strokeRect(
        element.x1,
        element.y1,
        element.x2 - element.x1,
        element.y2 - element.y1
      );
      context.restore();
      break;
    default:
      throw new Error(`Type not recognised: ${element.type}`);
  }
};

const adjustmentRequired = type => ["line", "rectangle"].includes(type);

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
  // const [elements, setElements, undo, redo] = useHistory([]);
  // const [action, setAction] = useState("none");
  // const [tool, setTool] = useState("rectangle");
  // const [selectedElement, setSelectedElement] = useState(null);
  // const [panOffset, setPanOffset] = React.useState({ x: 0, y: 0 });
  // const [startPanMousePosition, setStartPanMousePosition] = React.useState({ x: 0, y: 0 });
  // const [scale, setScale]=React.useState(1);
  // const [scaleOffset, setScaleOffset]=React.useState({ x:0, y:0 });
  // const [captureArea, setCaptureArea] = useState(null);
  // const textAreaRef = useRef();
  // const pressedKeys = usePressedKeys();
  // const [eraserSize, setEraserSize] = useState(10);
  // // Thêm state cho pencil size
  // const [pencilSize, setPencilSize] = useState(3);
  // const [isDrawing, setIsDrawing] = useState(false);
  // const idleTimerRef = useRef(null);
  // const lastDrawTimeRef = useRef(null);
  // const [drawingRegions, setDrawingRegions] = useState([]);
  // const [currentRegionElements, setCurrentRegionElements] = useState([]);
  // const [isDrawing, setIsDrawing] = useState(false);
  // const idleTimerRef = useRef(null);
  // const lastDrawTimeRef = useRef(null);
  // const lastElementIndexRef = useRef(0);
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
  // useLayoutEffect(() => {
  //   const canvas = document.getElementById("canvas");
  //   const context = canvas.getContext("2d");
  //   const roughCanvas = rough.canvas(canvas);

  //   context.clearRect(0, 0, canvas.width, canvas.height);

  //   const scaledWidth = canvas.width*scale;
  //   const scaledHeight = canvas.height*scale;

  //   const scaleOffsetX = (scaledWidth - canvas.width)/2;
  //   const scaleOffsetY = (scaledHeight - canvas.height)/2;
  //   setScaleOffset({x:scaleOffsetX, y:scaleOffsetY});



  //   context.save();
  //   context.translate(panOffset.x*scale-scaleOffsetX, panOffset.y*scale-scaleOffsetY);
  //   context.scale(scale, scale);


  //   elements.forEach(element => {
  //     if (action === "writing" && selectedElement.id === element.id) return;
  //     drawElement(roughCanvas, context, element);
  //   });
  //   drawingRegions.forEach(region => {
  //     const { bounds, id } = region;
  //     context.strokeStyle = "#0099ff";
  //     context.lineWidth = 1 / scale;
  //     context.setLineDash([5 / scale, 5 / scale]);
  //     context.strokeRect(
  //       bounds.x1,
  //       bounds.y1,
  //       bounds.x2 - bounds.x1,
  //       bounds.y2 - bounds.y1
  //     );
      
  //     // Vẽ số thứ tự
  //     context.setLineDash([]);
  //     context.font = `${16 / scale}px sans-serif`;
  //     context.fillStyle = "#0099ff";
  //     context.fillText(
  //       `#${id}`,
  //       bounds.x1 + 5 / scale,
  //       bounds.y1 + 20 / scale
  //     );
  //   });
    
  //   // if (elements.length > 0) {
  //   //   const bounds = calculateDrawnArea();
  //   //   if (bounds) {
  //   //     context.strokeStyle = "#0099ff";
  //   //     context.lineWidth = 1 / scale;
  //   //     context.setLineDash([5 / scale, 5 / scale]);
  //   //     context.strokeRect(
  //   //       bounds.x1,
  //   //       bounds.y1,
  //   //       bounds.x2 - bounds.x1,
  //   //       bounds.y2 - bounds.y1
  //   //     );
  //   //     context.setLineDash([]);
  //   //     context.font = `${16 / scale}px sans-serif`;
  //   //     context.fillStyle = "#0099ff";
  //   //     context.fillText(
  //   //     `#${id}`,
  //   //     bounds.x1 + 5 / scale,
  //   //     bounds.y1 + 20 / scale
  //   //     );
  //   //   }
  //   // }

  //   context.restore();
  // }, [elements, action, selectedElement, panOffset, scale]);
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
  const calculateBoundsForElements = (elementsList) => {
    if (elementsList.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    elementsList.forEach(element => {
      if (element.type === "text") {
        minX = Math.min(minX, element.x1);
        minY = Math.min(minY, element.y1);
        maxX = Math.max(maxX, element.x2);
        maxY = Math.max(maxY, element.y2);
      } else if (element.type === "pencil") {
        element.points.forEach(point => {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        });
      } else if (element.type === "line" || element.type === "rectangle") {
        minX = Math.min(minX, element.x1, element.x2);
        minY = Math.min(minY, element.y1, element.y2);
        maxX = Math.max(maxX, element.x1, element.x2);
        maxY = Math.max(maxY, element.y1, element.y2);
      }
    });

    const padding = 20;
    return {
      x1: minX - padding,
      y1: minY - padding,
      x2: maxX + padding,
      y2: maxY + padding
    };
  };
  const updateElement = (id, x1, y1, x2, y2, type, options) => {
    const elementsCopy = [...elements];

    switch (type) {
      case "line":
      case "rectangle":
        elementsCopy[id] = createElement(id, x1, y1, x2, y2, type);
        elementsCopy[id].size = pencilSize;
        break;
      case "pencil":
        elementsCopy[id].points = [...elementsCopy[id].points, { x: x2, y: y2 }];
        break;
      case "text":
        const textWidth = document
          .getElementById("canvas")
          .getContext("2d")
          .measureText(options.text).width;
        const textHeight = 24;
        elementsCopy[id] = {
          ...createElement(id, x1, y1, x1 + textWidth, y1 + textHeight, type),
          text: options.text,
        };
        break;
      default:
        throw new Error(`Type not recognised: ${type}`);
    }

    setElements(elementsCopy, true);
  };
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
  const getMouseCoordinates = event => {
    const clientX = (event.clientX - panOffset.x*scale +scaleOffset.x)/scale;
    const clientY = (event.clientY - panOffset.y*scale +scaleOffset.y)/scale;
    return { clientX, clientY };
  };

  const handleMouseDown = event => {
    if (action === "writing") return;

    const { clientX, clientY } = getMouseCoordinates(event);

    if (event.button === 1 || pressedKeys.has(" ")) {
      setAction("panning");
      setStartPanMousePosition({ x: clientX, y: clientY });
      return;
    }
    setIsDrawing(true);
    resetIdleTimer();
    if (tool === "capture") {
      const id = elements.length;
      const element = createElement(id, clientX, clientY, clientX, clientY, "capture");
      setElements(prevState => [...prevState, element]);
      setSelectedElement(element);
      setAction("drawing");
      return;
    }
    if (tool === "eraser") {
      const element = getElementAtPosition(clientX, clientY, elements);
      if (element) {
        // Xóa phần tử khỏi mảng elements
        setElements(prevState => prevState.filter(el => el.id !== element.id));
      }
      return;
    }
  
    if (tool === "selection") {
      const element = getElementAtPosition(clientX, clientY, elements);
      if (element) {
        if (element.type === "pencil") {
          const xOffsets = element.points.map(point => clientX - point.x);
          const yOffsets = element.points.map(point => clientY - point.y);
          setSelectedElement({ ...element, xOffsets, yOffsets });
        } else {
          const offsetX = clientX - element.x1;
          const offsetY = clientY - element.y1;
          setSelectedElement({ ...element, offsetX, offsetY });
        }
        setElements(prevState => prevState);

        if (element.position === "inside") {
          setAction("moving");
        } else {
          setAction("resizing");
        }
      }
    } else {
      const id = elements.length;
      const element = createElement(id, clientX, clientY, clientX, clientY, tool, pencilSize);
      setElements(prevState => [...prevState, element]);
      setSelectedElement(element);

      setAction(tool === "text" ? "writing" : "drawing");
    }
  };

  const handleMouseMove = event => {
    const { clientX, clientY } = getMouseCoordinates(event);

    if (action === "panning") {
      const deltaX = clientX - startPanMousePosition.x;
      const deltaY = clientY - startPanMousePosition.y;
      setPanOffset({
        x: panOffset.x + deltaX,
        y: panOffset.y + deltaY,
      });
      return;
    }
    if (tool === "eraser") {
      // Handle eraser movement
      const elementsCopy = [...elements];
      let hasChanges = false;

      elementsCopy.forEach(element => {
        if (element.type === "pencil") {
          element.points.forEach(point => {
            if (!point.isErased && isPointNearEraser(point.x, point.y, clientX, clientY, eraserSize)) {
              point.isErased = true;
              hasChanges = true;
            }
          });
        }
      });

      if (hasChanges) {
        setElements(elementsCopy, true);
      }
      return;
    }
    if (tool === "selection") {
      const element = getElementAtPosition(clientX, clientY, elements);
      event.target.style.cursor = element ? cursorForPosition(element.position) : "default";
    }
    
    if (action === "drawing") {
      const index = elements.length - 1;
      const { x1, y1 } = elements[index];
      resetIdleTimer();
      if (tool === "capture") {
        const element = elements[index];
        const updatedElement = {
          ...element,
          x2: clientX,
          y2: clientY
        };
        const elementsCopy = [...elements];
        elementsCopy[index] = updatedElement;
        setElements(elementsCopy, true);
        setCaptureArea(updatedElement);
      } else {
        updateElement(index, x1, y1, clientX, clientY, tool);
      }
    } else if (action === "moving") {
      if (selectedElement.type === "pencil") {
        const newPoints = selectedElement.points.map((_, index) => ({
          x: clientX - selectedElement.xOffsets[index],
          y: clientY - selectedElement.yOffsets[index],
        }));
        const elementsCopy = [...elements];
        elementsCopy[selectedElement.id] = {
          ...elementsCopy[selectedElement.id],
          points: newPoints,
        };
        setElements(elementsCopy, true);
      } else {
        const { id, x1, x2, y1, y2, type, offsetX, offsetY } = selectedElement;
        const width = x2 - x1;
        const height = y2 - y1;
        const newX1 = clientX - offsetX;
        const newY1 = clientY - offsetY;
        const options = type === "text" ? { text: selectedElement.text } : {};
        updateElement(id, newX1, newY1, newX1 + width, newY1 + height, type, options);
      }
    } else if (action === "resizing") {
      const { id, type, position, ...coordinates } = selectedElement;
      const { x1, y1, x2, y2 } = resizedCoordinates(clientX, clientY, position, coordinates);
      updateElement(id, x1, y1, x2, y2, type);
    }
  };

  const handleMouseUp = event => {
    setIsDrawing(false);
    const { clientX, clientY } = getMouseCoordinates(event);
    if (selectedElement) {
      if (
        selectedElement.type === "text" &&
        clientX - selectedElement.offsetX === selectedElement.x1 &&
        clientY - selectedElement.offsetY === selectedElement.y1
      ) {
        setAction("writing");
        return;
      }

      const index = selectedElement.id;
      const { id, type } = elements[index];
      if ((action === "drawing" || action === "resizing") && adjustmentRequired(type)) {
        const { x1, y1, x2, y2 } = adjustElementCoordinates(elements[index]);
        updateElement(id, x1, y1, x2, y2, type);
      }
    }
    if (action === "drawing"){
      console.log("Hoàn thành một nét vẽ");
      resetIdleTimer();
    }
    if (action === "writing") return;

    setAction("none");
    setSelectedElement(null);
  };

  const handleBlur = event => {
    const { id, x1, y1, type } = selectedElement;
    setAction("none");
    setSelectedElement(null);
    updateElement(id, x1, y1, null, null, type, { text: event.target.value });
  };
  const onZoom = delta=>{
    setScale(prevState => Math.min(Math.max(prevState + delta, 0.1),2)); 

  };
  
  return (
    <div>
      <div style={{ position: "fixed", zIndex: 2 }}>
      <input
        type="radio"
        id="selection"
        checked={tool === "selection"}
        onChange={() => setTool("selection")}
      />
      <label htmlFor="selection">Selection</label>
        <input
          type="radio"
          id="line"
          checked={tool === "line"}
          onChange={() => setTool("line")}
        />
        <label htmlFor="line">Line</label>

        <input
          type="radio"
          id="rectangle"
          checked={tool === "rectangle"}
          onChange={() => setTool("rectangle")}
        />
        <label htmlFor="rectangle">Rectangle</label>

        <input
          type="radio"
          id="pencil"
          checked={tool === "pencil"}
          onChange={() => setTool("pencil")}
        />
        <label htmlFor="pencil">Pencil</label>

        <input
          type="radio"
          id="text"
          checked={tool === "text"}
          onChange={() => setTool("text")}
        />
        <label htmlFor="text">Text</label>

        <input
          type="radio"
          id="eraser"
          checked={tool === "eraser"}
          onChange={() => setTool("eraser")}
        />
        <label htmlFor="eraser">Eraser</label>

        {elements.length > 0 && (
          <button 
            onClick={captureDrawnArea}
            style={{ marginLeft: '10px' }}
          >
            Capture Drawn Area
          </button>
        )}
      </div>

      {tool === "pencil" && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0px', 
          position: "fixed", 
          padding: '20px', 
          right: '20', 
          zIndex: '2', 
          top: '20' 
        }}>
          <label htmlFor="pencil-size">Size:</label>
          <input
            id="pencil-size"
            type="range"
            min="1"
            max="20"
            value={pencilSize}
            onChange={(e) => setPencilSize(parseInt(e.target.value))}
            style={{ width: '100px' }}
          />
          <span>{pencilSize}px</span>
        </div>
      )}
      {tool === "eraser" && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0px', 
          position: "fixed", 
          padding: '20px', 
          right: '20', 
          zIndex: '2', 
          top: '20' 
        }}>
          <label htmlFor="eraser-size">Eraser Size:</label>
          <input
            id="eraser-size"
            type="range"
            min="5"
            max="50"
            value={eraserSize}
            onChange={(e) => setEraserSize(parseInt(e.target.value))}
            style={{ width: '100px' }}
          />
          <span>{eraserSize}px</span>
        </div>
      )}
      <div style={{ position: "fixed", zIndex: 2, bottom: 0, padding: 10 }}>
        <button onClick={() => onZoom(-0.1)}>-</button>
        <span onClick={() => setScale(1)}>
          {new Intl.NumberFormat("en-GB", { style: "percent" }).format(scale)}
        </span>
        <button onClick={() => onZoom(0.1)}>+</button>
        <span> </span>
        <button onClick={undo}>Undo</button>
        <button onClick={redo}>Redo</button>
      </div>

      {action === "writing" ? (
        <textarea
          ref={textAreaRef}
          onBlur={handleBlur}
          style={{
            position: "fixed",
            top: (selectedElement.y1 - 2) * scale + panOffset.y * scale - scaleOffset.y,
            left: selectedElement.x1 * scale + panOffset.x * scale - scaleOffset.x,
            font: `${24 * scale}px sans-serif`,
            margin: 0,
            padding: 0,
            border: 0,
            outline: 0,
            resize: "auto",
            overflow: "hidden",
            whiteSpace: "pre",
            background: "transparent",
            zIndex: 2,
          }}
        />
      ) : null}

      <canvas
        id="canvas"
        width={window.innerWidth}
        height={window.innerHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ position: "absolute", zIndex: 1 }}
      >
        Canvas
      </canvas>
    </div>
  );
};

export default App;