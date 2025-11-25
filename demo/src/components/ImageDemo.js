import React, { Component } from "react";
import { Pannellum } from "../../../src";
import alma from "../images/alma.jpg";
import milan from "../images/milan.jpg";
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
          image: alma,
          hotspots: [],
          type: SceneType.EQUIRECTANGULAR,
          isPanorama: true
        },
        roomB: {
          id: "roomB",
          title: "Bedroom",
          image: milan,
          hotspots: [],
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
      error: null
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
  }

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

  // 🔹 Error boundary render method for viewer
  renderViewer() {
    const { currentScene, scenes, autoRotate, showControls } = this.state;
    const activeScene = scenes[currentScene];

    if (!activeScene || !activeScene.image) {
      return (
        <div style={styles.errorFallback}>
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
              cssClass="custom-hotspot"
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
        <div style={styles.errorFallback}>
          <h3>⚠️ Unable to load viewer</h3>
          <p>Please try refreshing or check your image file.</p>
          <button
            onClick={() => window.location.reload()}
            style={styles.retryButton}
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
      <div style={{
        fontFamily: "sans-serif",
        background: '#1a1a1a',
        minHeight: '100vh',
        padding: '20px',
        position: 'relative'
      }}>

        {/* Error Display */}
        {error && (
          <div style={styles.errorBanner}>
            <span>{error}</span>
            <button
              onClick={this.clearError}
              style={styles.closeErrorButton}
              aria-label="Close error message"
            >
              ×
            </button>
          </div>
        )}

        {/* Loading Overlay */}
        {isProcessingImage && (
          <div style={styles.loadingOverlay}>
            <div style={styles.loadingSpinner}></div>
            <p>Preparing Image...</p>
            <p style={{ fontSize: '12px', opacity: 0.7 }}>Optimizing for viewing</p>
          </div>
        )}

        {/* Header */}
        <div style={styles.header}>
          <h1 style={{ margin: 0, fontSize: '2.5em', fontWeight: 'bold' }}>🖼️ Image Viewer</h1>
          <p style={{ margin: '10px 0 0 0', opacity: 0.9 }}>Upload any image and explore it naturally</p>
        </div>

        {/* Quick Upload Controls */}
        <div style={styles.quickUploadContainer}>
          <h3 style={{ color: 'white', marginBottom: '15px', textAlign: 'center' }}>
            📸 Upload Images
          </h3>
          <div style={styles.uploadButtons}>
            <label style={styles.uploadButton}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={this.handleImageUpload}
                style={{ display: 'none' }}
              />
              🖼️ Upload Image
              <span style={styles.uploadSubtext}>No black areas - pure image</span>
            </label>
          </div>
          <p style={{ color: '#4ecdc4', textAlign: 'center', marginTop: '15px', fontSize: '14px' }}>
            Only the image is visible - no black parts, no stretching
          </p>
        </div>

        {/* Controls */}
        <div style={styles.controlsContainer}>
          <button
            onClick={this.startAddHotspot}
            style={{
              ...styles.tourButton,
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
              style={{
                ...styles.tourButton,
                background: autoRotate ? '#45b7d1' : '#96ceb4'
              }}
              aria-label={autoRotate ? 'Pause auto rotation' : 'Enable auto rotation'}
            >
              {autoRotate ? '⏸️ Pause Rotation' : '▶️ Enable Rotation'}
            </button>
          )}

          {Object.keys(scenes).map((key) => (
            <div key={key} style={{ position: 'relative' }}>
              <button
                onClick={() => this.changeScene(key)}
                style={{
                  ...styles.sceneButton,
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
                  style={styles.removeSceneButton}
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
          style={styles.viewerContainer}
        >
          <div style={{ width: '100%', height: '100%', borderRadius: '17px' }}>
            {this.renderViewer()}
          </div>

          {/* Scene Info Overlay */}
          {activeScene && (
            <div style={styles.sceneInfoOverlay}>
              <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '5px' }}>
                {activeScene.title}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>
                {isRealPanorama ? '360° Panorama' : 'Image View'}
                <div style={{ marginTop: '5px', color: '#4ecdc4' }}>
                  {isRealPanorama ? 'Full spherical view' : 'Pure image - no black areas'}
                </div>
              </div>
            </div>
          )}

          {/* Controls Info */}
          {showControls && activeScene && (
            <div style={styles.controlsInfo}>
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
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
          <div style={styles.hotspotsPanel}>
            <h3 style={{ margin: '0 0 20px 0', textAlign: 'center' }}>
              🧭 Navigation Points
            </h3>
            <div style={styles.hotspotsGrid}>
              {activeScene.hotspots.map((spot) => (
                <div
                  key={spot.id}
                  style={styles.hotspotCard}
                  onClick={() => this.changeScene(spot.target)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                    e.currentTarget.style.transform = 'translateY(-5px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
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
                    <button style={styles.visitButton}>
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
          <div style={styles.modalOverlay}>
            <div style={styles.tourModal}>
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
                <label style={styles.modalUploadButton}>
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
                  style={styles.sceneSelect}
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
                style={styles.tourButtonDanger}
                aria-label="Cancel adding navigation point"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Styles */}
        <style>{`
          .pnlm-container canvas {
            pointer-events: auto !important;
          }
          
          .custom-hotspot {
            width: 40px;
            height: 40px;
            background-image: url(${arrowIcon});
            background-size: contain;
            filter: drop-shadow(0 2px 8px rgba(0,0,0,0.7));
            border-radius: 50%;
            pointer-events: auto !important;
            z-index: 10;
          }
          
          .custom-hotspot::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 100%;
            height: 100%;
            background: radial-gradient(circle, rgba(78, 205, 196, 0.8) 0%, rgba(78, 205, 196, 0) 70%);
            border-radius: 50%;
            animation: pulse 2s infinite;
            pointer-events: none;
            z-index: -1;
          }
          
          @keyframes pulse {
            0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            50% { transform: translate(-50%, -50%) scale(1.5); opacity: 0.5; }
            100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          }

          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }
}

// Enhanced Styles
const styles = {
  header: {
    textAlign: 'center',
    marginBottom: '20px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
    borderRadius: '15px',
    color: 'white'
  },
  quickUploadContainer: {
    marginBottom: '20px',
    padding: '20px',
    background: 'linear-gradient(135deg, #2c3e50, #34495e)',
    borderRadius: '15px',
    border: '2px dashed #4ecdc4'
  },
  uploadButtons: {
    display: 'flex',
    gap: '15px',
    justifyContent: 'center',
    flexWrap: 'wrap'
  },
  uploadButton: {
    background: 'linear-gradient(135deg, #4ecdc4, #44a08d)',
    border: 'none',
    color: 'white',
    padding: '20px',
    borderRadius: '15px',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: 'all 0.3s ease',
    textAlign: 'center',
    minWidth: '250px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '5px',
    boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
  },
  uploadSubtext: {
    fontSize: '12px',
    opacity: 0.8,
    fontWeight: 'normal'
  },
  uploadModalButtons: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'center'
  },
  modalUploadButton: {
    background: 'linear-gradient(135deg, #3498db, #2980b9)',
    border: 'none',
    color: 'white',
    padding: '15px 20px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: 'all 0.3s ease',
    textAlign: 'center',
    width: '100%'
  },
  controlsContainer: {
    marginBottom: '20px',
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center'
  },
  viewerContainer: {
    border: "3px solid #34495e",
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
    height: '70vh',
    backgroundColor: '#000',
    borderRadius: '20px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    transition: 'opacity 0.3s ease'
  },
  sceneInfoOverlay: {
    position: 'absolute',
    top: '20px',
    left: '20px',
    background: 'rgba(0,0,0,0.8)',
    color: 'white',
    padding: '15px 20px',
    borderRadius: '15px',
    zIndex: 5,
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.1)',
    pointerEvents: 'none'
  },
  controlsInfo: {
    position: 'absolute',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.8)',
    color: 'white',
    padding: '15px 25px',
    borderRadius: '25px',
    fontSize: '14px',
    zIndex: 5,
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.1)',
    pointerEvents: 'none'
  },
  hotspotsPanel: {
    marginTop: '30px',
    padding: '25px',
    background: 'linear-gradient(135deg, #2c3e50, #34495e)',
    borderRadius: '20px',
    color: 'white'
  },
  hotspotsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '15px'
  },
  hotspotCard: {
    background: 'rgba(255,255,255,0.1)',
    padding: '20px',
    borderRadius: '15px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    border: '1px solid rgba(255,255,255,0.2)',
    backdropFilter: 'blur(10px)'
  },
  visitButton: {
    background: 'linear-gradient(135deg, #4ecdc4, #44a08d)',
    border: 'none',
    color: 'white',
    padding: '10px 20px',
    borderRadius: '25px',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: 'all 0.3s ease'
  },
  tourButton: {
    padding: "12px 20px",
    borderRadius: "25px",
    border: "none",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "bold",
    color: "white",
    transition: "all 0.3s ease",
    boxShadow: "0 4px 15px rgba(0,0,0,0.2)"
  },
  sceneButton: {
    padding: "10px 18px",
    borderRadius: "20px",
    border: "none",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "bold",
    color: "white",
    transition: "all 0.3s ease"
  },
  removeSceneButton: {
    position: 'absolute',
    top: '-8px',
    right: '-8px',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: '#e74c3c',
    border: 'none',
    color: 'white',
    fontSize: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0
  },
  tourButtonDanger: {
    padding: "12px 25px",
    borderRadius: "25px",
    border: "none",
    background: "linear-gradient(135deg, #e74c3c, #c0392b)",
    color: "white",
    cursor: "pointer",
    fontWeight: "bold",
    transition: "all 0.3s ease",
    width: '100%'
  },
  modalOverlay: {
    position: "fixed",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.8)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    backdropFilter: "blur(10px)"
  },
  tourModal: {
    background: "linear-gradient(135deg, #ffffff, #f8f9fa)",
    padding: "30px",
    borderRadius: "20px",
    width: "500px",
    maxWidth: "90vw",
    boxShadow: "0 25px 50px rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.2)"
  },
  fileInput: {
    width: '100%',
    padding: '15px',
    border: '2px dashed #bdc3c7',
    borderRadius: '10px',
    background: '#ecf0f1',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  sceneSelect: {
    width: '100%',
    padding: '15px',
    border: '2px solid #bdc3c7',
    borderRadius: '10px',
    background: 'white',
    fontSize: '14px',
    cursor: 'pointer'
  },
  errorBanner: {
    position: 'fixed',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
    color: 'white',
    padding: '15px 25px',
    borderRadius: '25px',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
    backdropFilter: 'blur(10px)'
  },
  closeErrorButton: {
    background: 'none',
    border: 'none',
    color: 'white',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '0',
    width: '25px',
    height: '25px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000,
    color: 'white',
    backdropFilter: 'blur(10px)'
  },
  loadingSpinner: {
    width: '50px',
    height: '50px',
    border: '5px solid rgba(255,255,255,0.3)',
    borderTop: '5px solid #4ecdc4',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '20px'
  },
  errorFallback: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    color: 'white',
    textAlign: 'center',
    padding: '40px'
  },
  retryButton: {
    padding: '10px 20px',
    background: '#4ecdc4',
    border: 'none',
    borderRadius: '25px',
    color: 'white',
    cursor: 'pointer',
    marginTop: '15px',
    fontWeight: 'bold'
  }
};

export default ImageDemoWithEditor;