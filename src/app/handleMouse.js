import { createElement, getElementAtPosition, adjustElementCoordinates, cursorForPosition, resizedCoordinates, adjustmentRequired } from './element-utils';

export const createMouseHandlers = ({
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
}) => {
  const getMouseCoordinates = event => {
    const clientX = (event.clientX - panOffset.x * scale + scaleOffset.x) / scale;
    const clientY = (event.clientY - panOffset.y * scale + scaleOffset.y) / scale;
    return { clientX, clientY };
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

  const handleMouseDown = event => {
    if (action === "writing") return;

    const { clientX, clientY } = getMouseCoordinates(event);

    if (event.button === 1 || pressedKeys.has(" ")) {
      setAction("panning");
      setStartPanMousePosition({ x: clientX, y: clientY });
      return;
    }

    setIsDrawing(true);

    if (tool === "capture") {
      const id = elements.length;
      const element = createElement(id, clientX, clientY, clientX, clientY, "capture");
      setElements(prevState => [...prevState, element]);
      setSelectedElement(element);
      setAction("drawing");
      return;
    }

    if (tool === "eraser") {
      setAction("erasing");
      const elementToErase = getElementAtPosition(clientX, clientY, elements);
      if (elementToErase) {
        setElements(prevState => 
          prevState.filter(el => el.id !== elementToErase.id)
        );
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

    if (action === "erasing") {
      const elementToErase = getElementAtPosition(clientX, clientY, elements);
      if (elementToErase) {
        setElements(prevState => 
          prevState.filter(el => el.id !== elementToErase.id)
        );
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

    if (action === "drawing") {
      console.log("Hoàn thành một nét vẽ");
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

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleBlur
  };
};