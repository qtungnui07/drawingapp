import React from 'react';

const DrawingBoard = ({
  tool,
  setTool,
  elements,
  pencilSize,
  setPencilSize,
  scale,
  setScale,
  onZoom,
  undo,
  redo,
  action,
  selectedElement,
  panOffset,
  scaleOffset,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleBlur,
  captureDrawnArea
}) => {
  const textAreaRef = React.useRef(null);

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

        {/* <input
          type="radio"
          id="text"
          checked={tool === "text"}
          onChange={() => setTool("text")}
        />
        <label htmlFor="text">Text</label> */}

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

export default DrawingBoard;