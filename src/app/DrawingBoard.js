import React from 'react';
import { 
  Undo2, 
  Redo2, 
  Pencil, 
  Hand, 
  Square, 
  Eraser,
  Sun,
  Moon,
  ZoomIn,
  ZoomOut,
  Grid,
  GripHorizontal,
  RotateCcw,
  Scan,
  Download,
  Menu,
  X
} from 'lucide-react';

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
  captureDrawnArea,
  handleDetectRegions,
  handleDownloadRegions
}) => {
  const textAreaRef = React.useRef(null);
  const backgroundCanvasRef = React.useRef(null);
  const drawingCanvasRef = React.useRef(null);
  const [backgroundType, setBackgroundType] = React.useState('none');
  const [gridSize, setGridSize] = React.useState(45);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [showDownloadButton, setShowDownloadButton] = React.useState(false);
  const [darkMode, setDarkMode] = React.useState(() => {
    const savedMode = localStorage.getItem('drawingBoardDarkMode');
    if (savedMode !== null) {
      return savedMode === 'true';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      const savedMode = localStorage.getItem('drawingBoardDarkMode');
      if (savedMode === null) {
        setDarkMode(e.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  React.useEffect(() => {
    localStorage.setItem('drawingBoardDarkMode', darkMode);
    drawElements();
  }, [darkMode]);

  const drawBackground = React.useCallback(() => {
    const canvas = backgroundCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = darkMode ? '#ffffff' : '#000000';
    ctx.fillRect(0, 0, width, height);

    const offsetX = (panOffset.x * scale - scaleOffset.x) % (gridSize * scale);
    const offsetY = (panOffset.y * scale - scaleOffset.y) % (gridSize * scale);
    const gridColor = darkMode ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.6)';

    if (backgroundType === 'grid') {
      ctx.beginPath();
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 0.5;

      for (let x = offsetX; x < width; x += gridSize * scale) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }

      for (let y = offsetY; y < height; y += gridSize * scale) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }

      ctx.stroke();
    } else if (backgroundType === 'dots') {
      ctx.fillStyle = gridColor;
      
      for (let x = offsetX; x < width; x += gridSize * scale) {
        for (let y = offsetY; y < height; y += gridSize * scale) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }, [backgroundType, gridSize, scale, panOffset, scaleOffset, darkMode]);

  const drawElements = React.useCallback(() => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(panOffset.x * scale - scaleOffset.x, panOffset.y * scale - scaleOffset.y);
    ctx.scale(scale, scale);

    const drawColor = darkMode ? '#000000' : '#ffffff';

    elements.forEach(element => {
      if (element.type === 'pencil') {
        ctx.beginPath();
        ctx.strokeStyle = drawColor;
        ctx.lineWidth = element.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        element.points.forEach((point, index) => {
          if (index === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        });
        ctx.stroke();
      } else if (element.type === 'line') {
        ctx.beginPath();
        ctx.strokeStyle = drawColor;
        ctx.lineWidth = 2;
        ctx.moveTo(element.x1, element.y1);
        ctx.lineTo(element.x2, element.y2);
        ctx.stroke();
      } else if (element.type === 'rectangle') {
        ctx.strokeStyle = drawColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(
          element.x1,
          element.y1,
          element.x2 - element.x1,
          element.y2 - element.y1
        );
      } else if (element.type === 'text') {
        ctx.font = '24px sans-serif';
        ctx.fillStyle = drawColor;
        ctx.fillText(element.text, element.x1, element.y1);
      }
    });

    ctx.restore();
  }, [elements, scale, panOffset, scaleOffset, darkMode]);

  React.useEffect(() => {
    drawBackground();
    drawElements();
  }, [drawBackground, drawElements]);

  React.useEffect(() => {
    const handleResize = () => {
      if (backgroundCanvasRef.current && drawingCanvasRef.current) {
        backgroundCanvasRef.current.width = window.innerWidth;
        backgroundCanvasRef.current.height = window.innerHeight;
        drawingCanvasRef.current.width = window.innerWidth;
        drawingCanvasRef.current.height = window.innerHeight;
        drawBackground();
        drawElements();
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [drawBackground, drawElements]);

  const toggleDarkMode = () => {
    setDarkMode(prev => !prev);
  };
  const handleDetectAndShowDownload = () => {
    handleDetectRegions();
    setShowDownloadButton(true);
    setIsMenuOpen(false);
  };  
  const iconColor = darkMode ? "#ffffff" : "#000000";
  const barBgColor = darkMode ? "bg-white" : "bg-gray-800";
  const textColor = darkMode ? 'text-white' : 'text-gray-600';
  
  return (
    <div className={`relative w-full h-screen ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
      {/* Corner Menu Button */}
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className={`fixed top-4 left-4 z-20 p-2 ${barBgColor} rounded-lg shadow-lg hover:bg-opacity-80`}
      >
        {isMenuOpen ? 
          <X size={24} color={iconColor} /> : 
          <Menu size={24} color={iconColor} />
        }
      </button>

      {/* Corner Menu Panel */}
      {isMenuOpen && (
        <div className={`fixed top-16 left-4 z-20 ${barBgColor} rounded-lg shadow-lg p-4 w-64`}>
          <div className="flex flex-col gap-4">
            {/* Theme Toggle */}
            <button
              onClick={() => setDarkMode(prev => !prev)}
              className={`w-full flex items-center justify-between p-2 rounded hover:bg-opacity-80 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
            >
              <span className={`text-sm ${darkMode ? 'text-gray-600' : 'text-white'}`}>
                {darkMode ? 'Light Mode' : 'Dark Mode'}
              </span>
              {darkMode ? 
                <Sun size={20} color={iconColor} /> : 
                <Moon size={20} color={iconColor} />
              }
            </button>

            {/* Grid Toggle */}
            <button
              onClick={() => setBackgroundType(prev => prev === 'grid' ? 'none' : 'grid')}
              className={`w-full flex items-center justify-between p-2 rounded hover:bg-opacity-80 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
            >
              <span className={`text-sm ${darkMode ? 'text-gray-600' : 'text-white'}`}>
                Show Grid
              </span>
              <Grid 
                size={20} 
                color={iconColor}
                className={backgroundType === 'grid' ? 'opacity-100' : 'opacity-50'}
              />
            </button>

            {/* Region Detection */}
            <button
              onClick={handleDetectAndShowDownload}
              className={`w-full flex items-center justify-between p-2 rounded hover:bg-opacity-80 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
            >
              <span className={`text-sm ${darkMode ? 'text-gray-600' : 'text-white'}`}>
                Detect Regions
              </span>
              <Scan size={20} color={iconColor} />
            </button>
          </div>
        </div>
      )}

      {/* Main Toolbar */}
      <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 flex items-center gap-1 ${barBgColor} rounded-lg shadow-lg p-2 z-10`}>
      <div className="flex items-center gap-1 pr-2 border-r border-gray-200">
        <button onClick={undo} className="p-2 rounded hover:bg-opacity-80" title="Undo">
          <Undo2 size={20} color={iconColor} />
        </button>
        <button onClick={redo} className="p-2 rounded hover:bg-opacity-80" title="Redo">
          <Redo2 size={20} color={iconColor} />
        </button>
      </div>

      <div className="flex items-center gap-1 px-2">
        <button
          onClick={() => setTool('selection')}
          className={`p-2 rounded ${tool === 'selection' ? 'bg-blue-500' : 'hover:bg-opacity-80'}`}
          title="Selection"
        >
          <Hand size={20} color={tool === 'selection' ? '#ffffff' : iconColor} />
        </button>
        <button
          onClick={() => setTool('line')}
          className={`p-2 rounded ${tool === 'line' ? 'bg-blue-500' : 'hover:bg-opacity-80'}`}
          title="Line"
        >
          <GripHorizontal size={20} color={tool === 'line' ? '#ffffff' : '#000000'} />
        </button>
        <button
          onClick={() => setTool('rectangle')}
          className={`p-2 rounded ${tool === 'rectangle' ? 'bg-blue-500' : 'hover:bg-opacity-80'}`}
          title="Rectangle"
        >
          <Square size={20} color={tool === 'rectangle' ? '#ffffff' : iconColor} />
        </button>
        <button
          onClick={() => setTool('pencil')}
          className={`p-2 rounded ${tool === 'pencil' ? 'bg-blue-500' : 'hover:bg-opacity-80'}`}
          title="Pencil"
        >
          <Pencil size={20} color={tool === 'pencil' ? '#ffffff' : iconColor} />
        </button>
        <button
          onClick={() => setTool('eraser')}
          className={`p-2 rounded ${tool === 'eraser' ? 'bg-blue-500' : 'hover:bg-opacity-80'}`}
          title="Eraser"
        >
          <Eraser size={20} color={tool === 'eraser' ? '#ffffff' : iconColor} />
        </button>
      </div>

      <div className="flex items-center gap-1 pl-2 border-l border-gray-200">
        <button
          onClick={() => setScale(1)}
          className="p-2 rounded hover:bg-opacity-80"
          title="Reset View"
        >
          <RotateCcw size={20} color={iconColor} />
        </button>
        <button
          onClick={() => onZoom(-0.1)}
          className="p-2 rounded hover:bg-opacity-80"
          title="Zoom Out"
        >
          <ZoomOut size={20} color={iconColor} />
        </button>
        <span className={`text-sm min-w-[4rem] text-center ${textColor}`}>
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => onZoom(0.1)}
          className="p-2 rounded hover:bg-opacity-80"
          title="Zoom In"
        >
          <ZoomIn size={20} color={iconColor} />
        </button>
      </div>
    </div>

      {/* Download Button */}
      {showDownloadButton && (
        <button
          onClick={() => {
            handleDownloadRegions();
            setShowDownloadButton(false);
          }}
          className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-20 px-4 py-2 bg-blue-500 text-white rounded-lg shadow-lg hover:bg-blue-600 flex items-center gap-2"
        >
          <Download size={20} color="#ffffff" />
          Download Detected Regions
        </button>
      )}

      {/* Canvas Container */}
      <div className="absolute inset-0">
        <canvas
          ref={backgroundCanvasRef}
          className="absolute inset-0 z-0"
        />
        <canvas
          id="canvas"
          ref={drawingCanvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="absolute inset-0 z-1"
        />
      </div>

      {/* Text Area for Writing */}
      {action === "writing" && (
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
            color: darkMode ? 'white' : 'black',
            zIndex: 2,
          }}
        />
      )}
    </div>
  );
};

export default DrawingBoard;