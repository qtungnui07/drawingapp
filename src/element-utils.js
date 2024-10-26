import rough from "roughjs/bundled/rough.esm";
import getStroke from "perfect-freehand";

const generator = rough.generator();

export const createElement = (id, x1, y1, x2, y2, type, pencilSize = 3) => {
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

export const isPointNearEraser = (x, y, eraserX, eraserY, eraserSize) => {
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

export const distance = (a, b) => Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

export const getElementAtPosition = (x, y, elements) => {
  return elements
    .map(element => ({ ...element, position: positionWithinElement(x, y, element) }))
    .find(element => element.position !== null);
};

export const adjustElementCoordinates = element => {
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

export const cursorForPosition = position => {
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

export const resizedCoordinates = (clientX, clientY, position, coordinates) => {
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
      return null;
  }
};

export const getSvgPathFromStroke = stroke => {
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

export const drawElement = (roughCanvas, context, element) => {
  switch (element.type) {
    case "line":
    case "rectangle":
      roughCanvas.draw(element.roughElement);
      break;
    case "pencil":
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
      context.save();
      context.strokeStyle = "#000000";
      context.setLineDash([5, 5]);
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

export const adjustmentRequired = type => ["line", "rectangle"].includes(type);

export const calculateBoundsForElements = (elementsList) => {
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
      maxY = Math.max(maxY, element.y2, element.y2);
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