import React, { Component } from "react";
import { Pannellum } from "../../../src";
import alma from "../images/almaa.jpg"; // Updated path
import milan from "../images/milann.jpg"; // Updated path
import arrowIcon from "../images/arrow.png";

// TypeScript-like interfaces for better code organization
const SceneType = {
  EQUIRECTANGULAR: 'equirectangular',
  CUBEMAP: 'cubemap'
};

class ImageDemoWithEditor extends Component {
  constructor(props) {
    super(props);

    this.state = {
      currentScene: "roomA",
      scenes: {
        roomA: {
          id: "roomA",
          title: "Living Room",
          image: alma, // Your custom image
          hotspots: [
            {
              id: "forward_1",
              pitch: 0,
              yaw: 0,
              target: "roomB",
              type: "street-view",
              direction: "forward",
              cssClass: "street-view-hotspot forward"
            }
          ],
          type: SceneType.EQUIRECTANGULAR,
          isPanorama: true
        },
        roomB: {
          id: "roomB",
          title: "Bedroom",
          image: milan, // Your custom image
          hotspots: [
            {
              id: "backward_1",
              pitch: 0,
              yaw: 180,
              target: "roomA",
              type: "street-view",
              direction: "backward",
              cssClass: "street-view-hotspot backward"
            }
          ],
          type: SceneType.EQUIRECTANGULAR,
          isPanorama: true
        }
      },
      isAddingHotspot: false,
      pendingHotspot: null,
      showLinkModal: false,
      objectUrls: [],
      isTransitioning: false,
      autoRotate: true,
      showControls: true,
      isProcessingImage: false,
      error: null,
      mousePosition: { x: 0, y: 0 },
      showStreetViewArrows: false
    };

    this.viewerRef = React.createRef();
    this.containerRef = React.createRef();
    this.fileInputRef = React.createRef();

    // Create web worker for image processing
    this.imageWorker = this.createImageWorker();
  }

  createImageWorker() {
    if (typeof Worker === 'undefined') return null;

    const workerCode = `
      self.addEventListener('message', async (e) => {
        const { imageUrl, type } = e.data;
        
        try {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          const bitmap = await createImageBitmap(blob);
          
          // For normal images - create a simple mapping without black areas
          const imageAspect = bitmap.width / bitmap.height;
          
          // Calculate panorama dimensions based on image aspect ratio
          let panoWidth, panoHeight;
          
          if (imageAspect >= 2) {
            // Wide image - use standard 2:1 ratio but adjust height
            panoWidth = 4096;
            panoHeight = Math.round(4096 / imageAspect);
          } else if (imageAspect <= 0.5) {
            // Tall image - use standard 2:1 ratio but adjust width
            panoHeight = 2048;
            panoWidth = Math.round(2048 * imageAspect);
          } else {
            // Normal aspect - use standard 2:1 ratio
            panoWidth = 4096;
            panoHeight = 2048;
          }
          
          // Ensure minimum dimensions
          panoWidth = Math.max(panoWidth, 2048);
          panoHeight = Math.max(panoHeight, 1024);
          
          const canvas = new OffscreenCanvas(panoWidth, panoHeight);
          const ctx = canvas.getContext('2d');
          
          // Fill with the image stretched to fit the canvas
          ctx.drawImage(bitmap, 0, 0, panoWidth, panoHeight);
          
          const finalBlob = await canvas.convertToBlob({ 
            type: 'image/jpeg', 
            quality: 0.95 
          });
          
          self.postMessage({ 
            success: true, 
            blob: finalBlob, 
            isPanorama: true,
            imageData: {
              originalWidth: bitmap.width,
              originalHeight: bitmap.height,
              panoWidth: panoWidth,
              panoHeight: panoHeight,
              aspectRatio: imageAspect
            }
          });
        } catch (error) {
          self.postMessage({ success: false, error: error.message });
        }
      });
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
  }

  componentDidMount() {
    // Add mouse move listener for Street View style navigation
    if (this.containerRef.current) {
      this.containerRef.current.addEventListener('mousemove', this.handleMouseMove);
    }
  }

  componentWillUnmount() {
    // Clean up all object URLs
    this.state.objectUrls.forEach(url => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });

    // Terminate web worker
    if (this.imageWorker) {
      this.imageWorker.terminate();
    }

    // Remove event listener
    if (this.containerRef.current) {
      this.containerRef.current.removeEventListener('mousemove', this.handleMouseMove);
    }
  }

  // 🔹 Handle mouse movement for Street View style navigation
  handleMouseMove = (event) => {
    const { clientX, clientY } = event;
    const containerRect = this.containerRef.current.getBoundingClientRect();
    
    const x = clientX - containerRect.left;
    const y = clientY - containerRect.top;
    
    this.setState({
      mousePosition: { x, y },
      showStreetViewArrows: true
    });

    // Hide arrows after 2 seconds of no movement
    clearTimeout(this.mouseTimeout);
    this.mouseTimeout = setTimeout(() => {
      this.setState({ showStreetViewArrows: false });
    }, 2000);
  };

  // 🔹 Convert normal images to panorama format without black areas
  convertImageToPanorama = (imageUrl) => {
    return new Promise((resolve, reject) => {
      if (!this.imageWorker) {
        // Fallback to main thread if workers aren't supported
        this.convertToSimplePanorama(imageUrl).then(resolve).catch(reject);
        return;
      }

      const messageHandler = (e) => {
        this.imageWorker.removeEventListener('message', messageHandler);

        if (e.data.success) {
          const processedUrl = URL.createObjectURL(e.data.blob);
          resolve({ 
            url: processedUrl, 
            isPanorama: true,
            imageData: e.data.imageData
          });
        } else {
          reject(new Error(e.data.error));
        }
      };

      this.imageWorker.addEventListener('message', messageHandler);
      this.imageWorker.postMessage({ imageUrl, type: 'convertToPanorama' });
    });
  };

  // 🔹 Simple conversion without black areas
  convertToSimplePanorama = (imageUrl) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        try {
          const imageAspect = img.width / img.height;
          
          // Calculate panorama dimensions based on image aspect ratio
          let panoWidth, panoHeight;
          
          if (imageAspect >= 2) {
            // Wide image
            panoWidth = 4096;
            panoHeight = Math.round(4096 / imageAspect);
          } else if (imageAspect <= 0.5) {
            // Tall image
            panoHeight = 2048;
            panoWidth = Math.round(2048 * imageAspect);
          } else {
            // Normal aspect
            panoWidth = 4096;
            panoHeight = 2048;
          }
          
          // Ensure minimum dimensions
          panoWidth = Math.max(panoWidth, 2048);
          panoHeight = Math.max(panoHeight, 1024);

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = panoWidth;
          canvas.height = panoHeight;

          // Simply stretch the image to fill the panorama
          ctx.drawImage(img, 0, 0, panoWidth, panoHeight);

          const imageData = {
            originalWidth: img.width,
            originalHeight: img.height,
            panoWidth: panoWidth,
            panoHeight: panoHeight,
            aspectRatio: imageAspect
          };

          canvas.toBlob((blob) => {
            if (blob) {
              const panoUrl = URL.createObjectURL(blob);
              resolve({ 
                url: panoUrl, 
                isPanorama: true,
                imageData: imageData
              });
            } else {
              reject(new Error("Failed to create blob"));
            }
          }, 'image/jpeg', 0.95);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error("Failed to load image for conversion"));
      img.src = imageUrl;
    });
  };

  // 🔹 Detect image type and calculate proper limits
  detectImageType = (imageUrl) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const aspectRatio = img.width / img.height;
        const isPanorama = aspectRatio >= 1.9 && aspectRatio <= 2.1;
        
        resolve({ 
          isPanorama, 
          width: img.width, 
          height: img.height,
          aspectRatio
        });
      };
      img.onerror = () => resolve({ 
        isPanorama: false, 
        width: 0, 
        height: 0, 
        aspectRatio: 1
      });
      img.src = imageUrl;
    });
  };

  // 🔹 Hotspot placement
  startAddHotspot = () => {
    this.setState({
      isAddingHotspot: true,
      pendingHotspot: null,
      showLinkModal: false,
      error: null
    });
  };

  handleViewerClick = (evt) => {
    if (!this.state.isAddingHotspot) return;

    try {
      const viewer = this.viewerRef.current?.getViewer?.();
      if (!viewer || !viewer.mouseEventToCoords) {
        throw new Error("Viewer not ready");
      }

      const [pitch, yaw] = viewer.mouseEventToCoords(evt);
      const pending = {
        id: "hs_" + Date.now(),
        pitch,
        yaw,
        target: null,
        icon: arrowIcon,
        label: ""
      };

      this.setState({
        pendingHotspot: pending,
        showLinkModal: true,
        isAddingHotspot: false
      });
    } catch (error) {
      this.setState({
        error: "Failed to place hotspot. Please try again.",
        isAddingHotspot: false
      });
    }
  };

  // 🔹 Enhanced image upload with simple panorama conversion
  handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (file.size > 20 * 1024 * 1024) {
      this.setState({ error: 'Please select an image smaller than 20MB.' });
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      this.setState({ error: 'Please select a valid image file.' });
      return;
    }

    this.setState({
      isProcessingImage: true,
      error: null
    });

    let objectUrl = null;
    let finalImageUrl = null;
    let imageData = null;

    try {
      objectUrl = URL.createObjectURL(file);
      const newSceneId = "scene_" + Date.now();

      // Track original URL for cleanup
      this.setState(prev => ({
        objectUrls: [...prev.objectUrls, objectUrl]
      }));

      const analysis = await this.detectImageType(objectUrl);
      
      if (analysis.isPanorama) {
        // Use original panorama as-is
        finalImageUrl = objectUrl;
        imageData = {
          originalWidth: analysis.width,
          originalHeight: analysis.height,
          panoWidth: analysis.width,
          panoHeight: analysis.height,
          aspectRatio: analysis.aspectRatio
        };
      } else {
        // Convert normal image to simple panorama format
        console.log("Converting image to simple panorama format...");
        const result = await this.convertImageToPanorama(objectUrl);
        finalImageUrl = result.url;
        imageData = result.imageData;
      }

      // Track the new URL
      this.setState(prev => ({
        objectUrls: [...prev.objectUrls, finalImageUrl]
      }));

      // Create the new scene immediately
      this.createSceneWithImage(finalImageUrl, newSceneId, analysis, imageData);

    } catch (error) {
      console.error("Image upload failed:", error);
      this.setState({
        error: 'Failed to process image. Please try another file.'
      });
    } finally {
      this.setState({ isProcessingImage: false });
    }
  };

  // 🔹 Scene creation with simple configuration
  createSceneWithImage = (imageUrl, sceneId, analysis, imageData) => {
    this.setState((prev) => {
      const isRealPanorama = analysis.isPanorama;
      
      const newScene = {
        id: sceneId,
        title: `View ${Object.keys(prev.scenes).length + 1}`,
        image: imageUrl,
        hotspots: [],
        type: SceneType.EQUIRECTANGULAR,
        isPanorama: true,
        imageData: imageData
      };

      if (isRealPanorama) {
        // Real panorama - full 360 view
        newScene.haov = 360;
        newScene.vaov = 180;
        newScene.vOffset = 0;
        newScene.hfov = 100;
      } else {
        // Normal image converted - simple view without black areas
        // Calculate field of view based on image dimensions
        const horizontalFov = 360 * (imageData.panoWidth / 4096);
        const verticalFov = 180 * (imageData.panoHeight / 2048);
        
        newScene.haov = horizontalFov;
        newScene.vaov = verticalFov;
        newScene.vOffset = 0;
        newScene.hfov = Math.min(100, horizontalFov);
        
        // Set strict navigation limits to prevent showing black areas
        newScene.minYaw = -horizontalFov / 2;
        newScene.maxYaw = horizontalFov / 2;
        newScene.minPitch = -verticalFov / 2;
        newScene.maxPitch = verticalFov / 2;
        newScene.minHfov = 50;
        newScene.maxHfov = Math.min(120, horizontalFov);
      }

      // Check if we're creating this scene from a hotspot or as a standalone scene
      const pending = prev.pendingHotspot;
      let scenes = { ...prev.scenes };

      if (pending) {
        // If there's a pending hotspot, link it to this new scene
        const hotspot = { ...pending, target: sceneId };
        const currentSceneHotspots = [
          ...(prev.scenes[prev.currentScene].hotspots || []),
          hotspot
        ];

        scenes[prev.currentScene] = {
          ...prev.scenes[prev.currentScene],
          hotspots: currentSceneHotspots
        };
      }

      // Add the new scene
      scenes[sceneId] = newScene;

      const newState = {
        scenes,
        showLinkModal: false,
        currentScene: sceneId // Switch to the new scene
      };

      // If there was a pending hotspot, clear it
      if (pending) {
        newState.pendingHotspot = null;
      }

      return newState;
    });
  };

  // 🔹 Handle selecting existing scene
  handleSelectExistingScene = (e) => {
    const targetSceneId = e.target.value;
    if (!targetSceneId) return;

    this.setState((prev) => {
      const pending = prev.pendingHotspot;
      if (!pending) return prev;

      const hotspot = { ...pending, target: targetSceneId };
      const scenes = {
        ...prev.scenes,
        [prev.currentScene]: {
          ...prev.scenes[prev.currentScene],
          hotspots: [
            ...(prev.scenes[prev.currentScene].hotspots || []),
            hotspot
          ]
        }
      };

      return {
        scenes,
        pendingHotspot: null,
        showLinkModal: false
      };
    });
  };

  // 🔹 Cancel linking
  cancelLinking = () => {
    this.setState({
      pendingHotspot: null,
      showLinkModal: false,
      isAddingHotspot: false,
      error: null
    });
  };

  // 🔹 Scene transition with error handling
  changeScene = (sceneId) => {
    if (!this.state.scenes[sceneId] || this.state.isTransitioning) return;

    this.setState({ isTransitioning: true });

    if (this.containerRef.current) {
      this.containerRef.current.style.opacity = '0.3';
    }

    setTimeout(() => {
      this.setState({
        currentScene: sceneId,
        isTransitioning: false,
        error: null
      }, () => {
        if (this.containerRef.current) {
          this.containerRef.current.style.opacity = '1';
        }
      });
    }, 300);
  };

  // 🔹 Remove scene with cleanup
  removeScene = (sceneId) => {
    if (Object.keys(this.state.scenes).length <= 1) {
      this.setState({ error: "Cannot remove the last scene" });
      return;
    }

    this.setState(prev => {
      const scene = prev.scenes[sceneId];

      // Clean up object URLs
      if (scene?.image?.startsWith('blob:')) {
        URL.revokeObjectURL(scene.image);
      }

      const newScenes = { ...prev.scenes };
      delete newScenes[sceneId];

      // Remove hotspots pointing to this scene from other scenes
      Object.keys(newScenes).forEach(key => {
        newScenes[key].hotspots = newScenes[key].hotspots.filter(
          hotspot => hotspot.target !== sceneId
        );
      });

      // Switch to another scene if current scene is being removed
      let newCurrentScene = prev.currentScene;
      if (sceneId === prev.currentScene) {
        const remainingScenes = Object.keys(newScenes);
        newCurrentScene = remainingScenes[0];
      }

      return {
        scenes: newScenes,
        currentScene: newCurrentScene,
        objectUrls: prev.objectUrls.filter(url => url !== scene?.image)
      };
    });
  };

  // 🔹 Tour controls
  toggleAutoRotate = () => {
    this.setState(prev => ({
      autoRotate: !prev.autoRotate
    }));
  };

  // 🔹 Clear error
  clearError = () => {
    this.setState({ error: null });
  };

  // 🔹 Render Street View navigation arrows for user-uploaded images
  renderStreetViewArrows = () => {
    const { currentScene, scenes, showStreetViewArrows, mousePosition } = this.state;
    const activeScene = scenes[currentScene];
    
    if (!showStreetViewArrows || !activeScene) return null;

    const container = this.containerRef.current;
    if (!container) return null;

    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // Show left arrow when mouse is in left 20% of container
    const showLeftArrow = mousePosition.x < containerWidth * 0.2;
    // Show right arrow when mouse is in right 20% of container
    const showRightArrow = mousePosition.x > containerWidth * 0.8;

    // Find hotspots for navigation
    const hotspots = activeScene.hotspots || [];
    const leftHotspot = hotspots.find(hotspot => 
      hotspot.direction === 'backward' || hotspot.yaw < -90
    );
    const rightHotspot = hotspots.find(hotspot => 
      hotspot.direction === 'forward' || hotspot.yaw > 90
    );

    return (
      <div className="street-view-arrows">
        {showLeftArrow && leftHotspot && (
          <div 
            className="street-view-arrow left-arrow"
            onClick={() => this.changeScene(leftHotspot.target)}
          >
            ←
          </div>
        )}
        {showRightArrow && rightHotspot && (
          <div 
            className="street-view-arrow right-arrow"
            onClick={() => this.changeScene(rightHotspot.target)}
          >
            →
          </div>
        )}
      </div>
    );
  };

  // 🔹 Error boundary render method for viewer
  renderViewer() {
    const { currentScene, scenes, autoRotate, showControls } = this.state;
    const activeScene = scenes[currentScene];

    if (!activeScene || !activeScene.image) {
      return (
        <div className="error-fallback">
          <h3>🖼️ No Image Loaded</h3>
          <p>Upload an image to start exploring</p>
        </div>
      );
    }

    try {
      const isRealPanorama = activeScene.haov === 360;
      
      const viewerConfig = {
        key: currentScene,
        ref: this.viewerRef,
        width: "100%",
        height: "100%",
        image: activeScene.image,
        pitch: 0,
        yaw: 180,
        hfov: activeScene.hfov || 100,
        autoLoad: true,
        onMousedown: this.handleViewerClick,
        showZoomCtrl: showControls,
        showFullscreenCtrl: showControls,
        compass: showControls && isRealPanorama,
        autoRotate: autoRotate && isRealPanorama ? -2 : 0,
      };

      // Add specific configuration based on image type
      if (activeScene.haov) viewerConfig.haov = activeScene.haov;
      if (activeScene.vaov) viewerConfig.vaov = activeScene.vaov;
      if (activeScene.vOffset) viewerConfig.vOffset = activeScene.vOffset;
      if (activeScene.minYaw) viewerConfig.minYaw = activeScene.minYaw;
      if (activeScene.maxYaw) viewerConfig.maxYaw = activeScene.maxYaw;
      if (activeScene.minPitch) viewerConfig.minPitch = activeScene.minPitch;
      if (activeScene.maxPitch) viewerConfig.maxPitch = activeScene.maxPitch;
      if (activeScene.minHfov) viewerConfig.minHfov = activeScene.minHfov;
      if (activeScene.maxHfov) viewerConfig.maxHfov = activeScene.maxHfov;

      return (
        <Pannellum {...viewerConfig}>
          {(activeScene.hotspots || []).map((spot) => (
            <Pannellum.Hotspot
              key={spot.id}
              type="custom"
              pitch={spot.pitch}
              yaw={spot.yaw}
              cssClass={spot.cssClass || "custom-hotspot"}
              handleClick={(e) => {
                e.stopPropagation();
                this.changeScene(spot.target);
              }}
              handleClickArg={spot}
            />
          ))}
        </Pannellum>
      );
    } catch (error) {
      console.error("Viewer rendering error:", error);
      return (
        <div className="error-fallback">
          <h3>⚠️ Unable to load viewer</h3>
          <p>Please try refreshing or check your image file.</p>
          <button
            onClick={() => window.location.reload()}
            className="retry-button"
          >
            Retry
          </button>
        </div>
      );
    }
  }

  render() {
    const {
      currentScene,
      scenes,
      showLinkModal,
      isAddingHotspot,
      autoRotate,
      showControls,
      isProcessingImage,
      error
    } = this.state;

    const activeScene = scenes[currentScene];
    const isRealPanorama = activeScene && activeScene.haov === 360;

    return (
      <div className="image-demo-container">

        {/* Error Display */}
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button
              onClick={this.clearError}
              className="close-error-button"
              aria-label="Close error message"
            >
              ×
            </button>
          </div>
        )}

        {/* Loading Overlay */}
        {isProcessingImage && (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
            <p>Preparing Image...</p>
            <p style={{ fontSize: '12px', opacity: 0.7 }}>Optimizing for viewing</p>
          </div>
        )}

        {/* Header */}
        <div className="header-section">
          <h1 style={{ margin: 0, fontSize: '2.5em', fontWeight: 'bold' }}>🖼️ Street View Style Navigation</h1>
          <p style={{ margin: '10px 0 0 0', opacity: 0.9 }}>Move your cursor to reveal navigation arrows like Google Street View</p>
        </div>

        {/* Quick Upload Controls */}
        <div className="quick-upload-container">
          <h3 style={{ color: 'white', marginBottom: '15px', textAlign: 'center' }}>
            📸 Upload Images
          </h3>
          <div className="upload-buttons">
            <label className="upload-button">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={this.handleImageUpload}
                style={{ display: 'none' }}
              />
              🖼️ Upload Image
              <span className="upload-subtext">No black areas - pure image</span>
            </label>
          </div>
          <p className="upload-info-text">
            Move cursor around the image to reveal Street View navigation arrows
          </p>
        </div>

        {/* Controls */}
        <div className="controls-container">
          <button
            onClick={this.startAddHotspot}
            className="tour-button"
            style={{
              background: isAddingHotspot ? '#ff6b6b' : '#4ecdc4'
            }}
            aria-label={isAddingHotspot ? "Click in the tour to place navigation point" : "Add navigation point"}
            onKeyPress={(e) => e.key === 'Enter' && this.startAddHotspot()}
          >
            {isAddingHotspot ? "📍 Click to Place Hotspot" : "🔗 Add Navigation Point"}
          </button>

          {isRealPanorama && (
            <button
              onClick={this.toggleAutoRotate}
              className="tour-button"
              style={{
                background: autoRotate ? '#45b7d1' : '#96ceb4'
              }}
              aria-label={autoRotate ? 'Pause auto rotation' : 'Enable auto rotation'}
            >
              {autoRotate ? '⏸️ Pause Rotation' : '▶️ Enable Rotation'}
            </button>
          )}

          {Object.keys(scenes).map((key) => (
            <div key={key} className="scene-button-container">
              <button
                onClick={() => this.changeScene(key)}
                className="scene-button"
                style={{
                  background: key === currentScene ? '#e17055' : '#2d3436',
                  transform: key === currentScene ? 'scale(1.05)' : 'scale(1)',
                  boxShadow: key === currentScene ? '0 8px 25px rgba(0,0,0,0.3)' : 'none'
                }}
                aria-label={`Switch to ${scenes[key].title}`}
              >
                {scenes[key].title} 
                <span style={{ marginLeft: '8px' }}>
                  {scenes[key].haov === 360 ? '🌐' : '🏞️'}
                </span>
              </button>

              {Object.keys(scenes).length > 1 && (
                <button
                  onClick={() => this.removeScene(key)}
                  className="remove-scene-button"
                  aria-label={`Remove ${scenes[key].title}`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Viewer */}
        <div
          ref={this.containerRef}
          className="viewer-container"
        >
          <div style={{ width: '100%', height: '100%', borderRadius: '17px' }}>
            {this.renderViewer()}
          </div>

          {/* Street View Navigation Arrows */}
          {this.renderStreetViewArrows()}

          {/* Scene Info Overlay */}
          {activeScene && (
            <div className="scene-info-overlay">
              <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '5px' }}>
                {activeScene.title}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>
                {isRealPanorama ? '360° Panorama' : 'Image View'}
                <div style={{ marginTop: '5px', color: '#4ecdc4' }}>
                  Move cursor to reveal navigation arrows
                </div>
              </div>
            </div>
          )}

          {/* Controls Info */}
          {showControls && activeScene && (
            <div className="controls-info">
              <div className="controls-row">
                <span>🖱️ Drag to look around</span>
                <span>🔍 Scroll to zoom</span>
                {isRealPanorama && autoRotate && <span style={{ color: '#4ecdc4' }}>🔄 Auto-rotating</span>}
                {!isRealPanorama && <span style={{ color: '#f39c12' }}>📱 Image Only</span>}
              </div>
            </div>
          )}
        </div>

        {/* Navigation Hotspots Panel */}
        {activeScene && activeScene.hotspots && activeScene.hotspots.length > 0 && (
          <div className="hotspots-panel">
            <h3 style={{ margin: '0 0 20px 0', textAlign: 'center' }}>
              🧭 Navigation Points
            </h3>
            <div className="hotspots-grid">
              {activeScene.hotspots.map((spot) => (
                <div
                  key={spot.id}
                  className="hotspot-card"
                  onClick={() => this.changeScene(spot.target)}
                  role="button"
                  tabIndex={0}
                  onKeyPress={(e) => e.key === 'Enter' && this.changeScene(spot.target)}
                  aria-label={`Navigate to ${scenes[spot.target]?.title || 'next location'}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '5px' }}>
                        {scenes[spot.target]?.title || "Next Location"}
                      </div>
                      <div style={{ fontSize: '14px', opacity: 0.8 }}>
                        {scenes[spot.target]?.haov === 360 ? '360° Panorama' : 'Image View'}
                      </div>
                    </div>
                    <button className="visit-button">
                      Visit →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Linking Modal */}
        {showLinkModal && this.state.pendingHotspot && (
          <div className="modal-overlay">
            <div className="tour-modal">
              <h3 style={{ textAlign: 'center', color: '#2c3e50', marginBottom: '10px' }}>
                🗺️ Add Navigation Point
              </h3>
              <p style={{ textAlign: 'center', color: '#7f8c8d', marginBottom: '25px' }}>
                Connect this point to another location
              </p>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: '#2c3e50' }}>
                  📸 Add New Location
                </label>
                <label className="modal-upload-button">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={this.handleImageUpload}
                    style={{ display: 'none' }}
                  />
                  🖼️ Upload Image
                </label>
                <p style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '8px', textAlign: 'center' }}>
                  Pure image view - no black areas
                </p>
              </div>

              <div style={{ marginBottom: '25px' }}>
                <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: '#2c3e50' }}>
                  🔄 Link to Existing Location
                </label>
                <select
                  onChange={this.handleSelectExistingScene}
                  className="scene-select"
                  aria-label="Select existing tour location"
                >
                  <option value="">-- Select a location --</option>
                  {Object.keys(scenes)
                    .filter(s => s !== currentScene)
                    .map((s) => (
                      <option key={s} value={s}>
                        {scenes[s].title} ({scenes[s].haov === 360 ? '360°' : 'Image'})
                      </option>
                    ))}
                </select>
              </div>

              <button
                onClick={this.cancelLinking}
                className="tour-button-danger"
                aria-label="Cancel adding navigation point"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Custom hotspot background image */}
        <style>{`
          .custom-hotspot {
            background-image: url(${arrowIcon});
          }
          
          /* Street View Navigation Arrows */
          .street-view-arrows {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 10;
          }
          
          .street-view-arrow {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(0, 0, 0, 0.6);
            color: white;
            font-size: 40px;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            pointer-events: auto;
            transition: all 0.3s ease;
            border: 2px solid rgba(255, 255, 255, 0.8);
          }
          
          .street-view-arrow:hover {
            background: rgba(0, 0, 0, 0.8);
            transform: translateY(-50%) scale(1.1);
          }
          
          .left-arrow {
            left: 20px;
          }
          
          .right-arrow {
            right: 20px;
          }
        `}</style>
      </div>
    );
  }
}

export default ImageDemoWithEditor;