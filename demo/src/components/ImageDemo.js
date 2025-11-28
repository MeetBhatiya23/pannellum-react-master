import React, { Component } from "react";
import { Pannellum } from "../../../src";
import alma from "../images/alma.jpg";
import milan from "../images/milan.jpg";
import arrowIcon from "../images/arrow.png";

// Constants
const SceneType = {
  EQUIRECTANGULAR: 'equirectangular',
  CUBEMAP: 'cubemap'
};

const HOTSPOT_TYPES = {
  NAVIGATION: 'navigation',
  INFO: 'info',
  VIDEO: 'video',
  STREET_VIEW: 'street-view'
};

const TOUR_SPEED = {
  SLOW: 8000,
  MEDIUM: 5000,
  FAST: 3000
};

// Create info icon as SVG data URL
const infoIcon = "data:image/svg+xml;base64," + btoa(`
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="18" fill="#3498db" stroke="white" stroke-width="2"/>
    <circle cx="20" cy="15" r="2" fill="white"/>
    <rect x="18" y="20" width="4" height="10" rx="2" fill="white"/>
  </svg>
`);

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
          isPanorama: true,
          thumbnail: null,
          haov: 360,
          vaov: 180,
          hfov: 100
        },
        roomB: {
          id: "roomB",
          title: "Bedroom",
          image: milan,
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
          isPanorama: true,
          thumbnail: null,
          haov: 360,
          vaov: 180,
          hfov: 100
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
      editingHotspot: null,
      isGuidedTour: false,
      tourSpeed: TOUR_SPEED.MEDIUM,
      isVRMode: false,
      language: 'en',
      showMiniMap: true,
      activeInfoHotspot: null,
      mousePosition: { x: 0, y: 0 },
      showStreetViewArrows: false
    };

    this.viewerRef = React.createRef();
    this.containerRef = React.createRef();
    this.fileInputRef = React.createRef();
    this.tourInterval = null;
    this.touchStartX = null;
    this.touchStartY = null;
    this.mouseTimeout = null;

    // Create web worker for image processing
    this.imageWorker = this.createImageWorker();
  }

  // Translations
  translations = {
    en: {
      addHotspot: 'Add Navigation Point',
      autoRotate: 'Auto Rotate',
      pauseAutoRotate: 'Pause Auto Rotate',
      enableAutoRotate: 'Enable Auto Rotate',
      processingImage: 'Processing image...',
      dragToLook: 'Drag to look around',
      scrollToZoom: 'Scroll to zoom',
      navigationPoints: 'Navigation Points',
      addNewLocation: 'Add New Tour Location',
      linkToExisting: 'Link to Existing Location',
      startTour: 'Start Guided Tour',
      stopTour: 'Stop Guided Tour',
      panoramaView: '360° Panorama View',
      enhancedView: 'Enhanced View',
      visit: 'Visit →',
      cancel: 'Cancel',
      remove: 'Remove',
      saveTour: 'Save Tour',
      loadTour: 'Load Tour',
      exportTour: 'Export Tour'
    },
    es: {
      addHotspot: 'Añadir Punto de Navegación',
      autoRotate: 'Rotación Automática',
      pauseAutoRotate: 'Pausar Rotación Automática',
      enableAutoRotate: 'Activar Rotación Automática',
      processingImage: 'Procesando imagen...',
      dragToLook: 'Arrastra para mirar alrededor',
      scrollToZoom: 'Desplázate para hacer zoom',
      navigationPoints: 'Puntos de Navegación',
      addNewLocation: 'Añadir Nueva Ubicación',
      linkToExisting: 'Enlazar a Ubicación Existente',
      startTour: 'Iniciar Tour Guiado',
      stopTour: 'Detener Tour Guiado',
      panoramaView: 'Vista Panorámica 360°',
      enhancedView: 'Vista Mejorada',
      visit: 'Visitar →',
      cancel: 'Cancelar',
      remove: 'Eliminar',
      saveTour: 'Guardar Tour',
      loadTour: 'Cargar Tour',
      exportTour: 'Exportar Tour'
    }
  };

  createImageWorker() {
    if (typeof Worker === 'undefined') return null;

    const workerCode = `
      self.addEventListener('message', async (e) => {
        const { imageUrl, type, maxWidth, maxHeight } = e.data;
        
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

  async componentDidMount() {
    this.preloadImages();
    this.loadTour();
    this.generateAllThumbnails();
    
    // Add event listeners
    document.addEventListener('keydown', this.handleKeyDown);
    
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

    // Clear tour interval
    if (this.tourInterval) {
      clearInterval(this.tourInterval);
    }

    // Remove event listeners
    document.removeEventListener('keydown', this.handleKeyDown);
    
    // Remove mouse move listener
    if (this.containerRef.current) {
      this.containerRef.current.removeEventListener('mousemove', this.handleMouseMove);
    }
    
    // Clear mouse timeout
    if (this.mouseTimeout) {
      clearTimeout(this.mouseTimeout);
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

  // 🔹 Image preloading
  preloadImages = () => {
    Object.values(this.state.scenes).forEach(scene => {
      const img = new Image();
      img.src = scene.image;
    });
  };

  // 🔹 Generate thumbnails for all scenes
  generateAllThumbnails = async () => {
    const scenes = { ...this.state.scenes };
    
    for (const sceneId in scenes) {
      if (!scenes[sceneId].thumbnail) {
        const thumbnail = await this.generateThumbnail(scenes[sceneId].image);
        scenes[sceneId].thumbnail = thumbnail;
      }
    }
    
    this.setState({ scenes });
  };

  // 🔹 Generate thumbnail
  generateThumbnail = (imageUrl) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 50;
        const ctx = canvas.getContext('2d');
        
        // Fill with black background
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, 100, 50);
        
        // Calculate aspect ratio
        const ratio = Math.min(80 / img.width, 40 / img.height);
        const width = img.width * ratio;
        const height = img.height * ratio;
        const x = (100 - width) / 2;
        const y = (50 - height) / 2;
        
        ctx.drawImage(img, x, y, width, height);
        resolve(canvas.toDataURL());
      };
      img.onerror = () => resolve(null);
      img.src = imageUrl;
    });
  };

  // 🔹 Image compression
  compressImage = (file) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        const MAX_WIDTH = 4096;
        const MAX_HEIGHT = 2048;
        let { width, height } = img;
        
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(resolve, 'image/jpeg', 0.8);
      };
      
      img.src = URL.createObjectURL(file);
    });
  };

  // 🔹 Convert image using Web Worker
  convertImageInWorker = (imageUrl) => {
    return new Promise((resolve, reject) => {
      if (!this.imageWorker) {
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
      this.imageWorker.postMessage({ 
        imageUrl, 
        type: 'convertToPanorama',
        maxWidth: 2048,
        maxHeight: 1024
      });
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

  // 🔹 Detect image type
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

  // 🔹 Add info hotspot
  addInfoHotspot = (pitch, yaw, content = "Information point") => {
    const hotspot = {
      id: `info_${Date.now()}`,
      pitch,
      yaw,
      type: HOTSPOT_TYPES.INFO,
      content,
      icon: infoIcon,
      label: "Info"
    };

    this.setState(prev => ({
      scenes: {
        ...prev.scenes,
        [prev.currentScene]: {
          ...prev.scenes[prev.currentScene],
          hotspots: [...prev.scenes[prev.currentScene].hotspots, hotspot]
        }
      },
      isAddingHotspot: false
    }));
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
        label: "",
        type: HOTSPOT_TYPES.NAVIGATION,
        cssClass: "custom-hotspot white-hotspot"
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

    if (file.size > 20 * 1024 * 1024) {
      this.setState({ error: 'Please select an image smaller than 20MB.' });
      return;
    }

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
      // Compress image first
      const compressedBlob = await this.compressImage(file);
      objectUrl = URL.createObjectURL(compressedBlob);
      const newSceneId = "scene_" + Date.now();

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
        const result = await this.convertImageInWorker(objectUrl);
        finalImageUrl = result.url;
        imageData = result.imageData;
      }

      this.setState(prev => ({
        objectUrls: [...prev.objectUrls, finalImageUrl]
      }));

      // Generate thumbnail
      const thumbnail = await this.generateThumbnail(finalImageUrl);

      this.createSceneWithImage(finalImageUrl, newSceneId, analysis, thumbnail, imageData);

      // Track user interaction
      this.trackUserInteraction('scene_upload', { 
        sceneId: newSceneId, 
        isPanorama: analysis.isPanorama 
      });

    } catch (error) {
      console.error("Image upload failed:", error);
      this.setState({
        error: 'Failed to process image. Please try another file.'
      });
    } finally {
      this.setState({ isProcessingImage: false });
      if (this.fileInputRef.current) {
        this.fileInputRef.current.value = '';
      }
    }
  };

  // 🔹 Scene creation with simple configuration
  createSceneWithImage = (imageUrl, sceneId, analysis, thumbnail, imageData) => {
    this.setState((prev) => {
      const isRealPanorama = analysis.isPanorama;
      
      const newScene = {
        id: sceneId,
        title: `View ${Object.keys(prev.scenes).length + 1}`,
        image: imageUrl,
        hotspots: [],
        type: SceneType.EQUIRECTANGULAR,
        isPanorama: true,
        thumbnail: thumbnail,
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
        const hotspot = { 
          ...pending, 
          target: sceneId,
          cssClass: "custom-hotspot" // Remove white-hotspot class after linking
        };
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

      const hotspot = { 
        ...pending, 
        target: targetSceneId,
        cssClass: "custom-hotspot" // Remove white-hotspot class after linking
      };
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

      // Track user interaction
      this.trackUserInteraction('hotspot_created', { 
        fromScene: prev.currentScene, 
        toScene: targetSceneId 
      });

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
  changeScene = async (sceneId) => {
    if (!this.state.scenes[sceneId] || this.state.isTransitioning) return;

    const prevScene = this.state.currentScene;

    this.setState({ isTransitioning: true });

    if (this.containerRef.current) {
      this.containerRef.current.style.opacity = '0.3';
    }

    // Preload next scene image
    const nextSceneImage = new Image();
    nextSceneImage.src = this.state.scenes[sceneId].image;

    await new Promise(resolve => {
      nextSceneImage.onload = resolve;
      setTimeout(resolve, 500); // Fallback
    });

    this.setState({
      currentScene: sceneId,
      isTransitioning: false
    }, () => {
      if (this.containerRef.current) {
        this.containerRef.current.style.opacity = '1';
      }
      
      // Track user interaction
      this.trackUserInteraction('scene_change', { 
        from: prevScene, 
        to: sceneId 
      });
    });
  };

  // 🔹 Navigate to adjacent scene
  navigateToAdjacentScene = (direction) => {
    const sceneIds = Object.keys(this.state.scenes);
    const currentIndex = sceneIds.indexOf(this.state.currentScene);
    
    if (direction === 'next') {
      const nextIndex = (currentIndex + 1) % sceneIds.length;
      this.changeScene(sceneIds[nextIndex]);
    } else {
      const prevIndex = currentIndex === 0 ? sceneIds.length - 1 : currentIndex - 1;
      this.changeScene(sceneIds[prevIndex]);
    }
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

  // 🔹 Hotspot management
  startEditHotspot = (hotspotId) => {
    this.setState({ editingHotspot: hotspotId });
  };

  updateHotspotLabel = (hotspotId, newLabel) => {
    this.setState(prev => ({
      scenes: {
        ...prev.scenes,
        [prev.currentScene]: {
          ...prev.scenes[prev.currentScene],
          hotspots: prev.scenes[prev.currentScene].hotspots.map(hotspot =>
            hotspot.id === hotspotId 
              ? { ...hotspot, label: newLabel }
              : hotspot
          )
        }
      }
    }));
  };

  removeHotspot = (hotspotId) => {
    this.setState(prev => ({
      scenes: {
        ...prev.scenes,
        [prev.currentScene]: {
          ...prev.scenes[prev.currentScene],
          hotspots: prev.scenes[prev.currentScene].hotspots.filter(
            hotspot => hotspot.id !== hotspotId
          )
        }
      }
    }));
  };

  // 🔹 Guided Tour
  startGuidedTour = () => {
    const sceneIds = Object.keys(this.state.scenes);
    if (sceneIds.length <= 1) return;

    this.setState({ isGuidedTour: true });

    this.tourInterval = setInterval(() => {
      const currentIndex = sceneIds.indexOf(this.state.currentScene);
      const nextIndex = (currentIndex + 1) % sceneIds.length;
      this.changeScene(sceneIds[nextIndex]);
    }, this.state.tourSpeed);

    this.trackUserInteraction('tour_started', { speed: this.state.tourSpeed });
  };

  stopGuidedTour = () => {
    if (this.tourInterval) {
      clearInterval(this.tourInterval);
      this.tourInterval = null;
    }
    this.setState({ isGuidedTour: false });
    this.trackUserInteraction('tour_stopped');
  };

  setTourSpeed = (speed) => {
    this.setState({ tourSpeed: speed });
    if (this.state.isGuidedTour) {
      this.stopGuidedTour();
      this.startGuidedTour();
    }
  };

  // 🔹 VR Mode
  enterVRMode = async () => {
    if (navigator.xr) {
      try {
        await this.viewerRef.current.enterVR();
        this.setState({ isVRMode: true });
        this.trackUserInteraction('vr_entered');
      } catch (error) {
        console.error('VR not supported:', error);
        this.setState({ error: 'VR mode not supported on this device' });
      }
    } else {
      this.setState({ error: 'WebXR not supported on this device' });
    }
  };

  exitVRMode = () => {
    this.setState({ isVRMode: false });
    this.trackUserInteraction('vr_exited');
  };

  // 🔹 State Persistence
  saveTour = () => {
    const tourData = {
      scenes: this.state.scenes,
      createdAt: new Date().toISOString(),
      version: '1.0'
    };
    try {
      localStorage.setItem('virtualTour', JSON.stringify(tourData));
      this.setState({ error: 'Tour saved successfully!' });
      setTimeout(() => this.setState({ error: null }), 3000);
      this.trackUserInteraction('tour_saved');
    } catch (error) {
      this.setState({ error: 'Failed to save tour' });
    }
  };

  loadTour = () => {
    const saved = localStorage.getItem('virtualTour');
    if (saved) {
      try {
        const tourData = JSON.parse(saved);
        this.setState({ 
          scenes: tourData.scenes,
          currentScene: Object.keys(tourData.scenes)[0]
        }, () => {
          this.generateAllThumbnails();
          this.trackUserInteraction('tour_loaded');
        });
      } catch (error) {
        console.error('Failed to load saved tour:', error);
      }
    }
  };

  exportTour = () => {
    const dataStr = JSON.stringify(this.state.scenes, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'virtual-tour.json';
    link.click();
    URL.revokeObjectURL(url);
    this.trackUserInteraction('tour_exported');
  };

  // 🔹 Analytics
  trackUserInteraction = (action, data = {}) => {
    // Google Analytics (if available)
    if (typeof gtag !== 'undefined') {
      gtag('event', action, data);
    }
    
    // Custom analytics logging
    console.log('User Interaction:', action, {
      ...data,
      timestamp: new Date().toISOString(),
      currentScene: this.state.currentScene
    });
  };

  // 🔹 Touch handling for mobile
  handleTouchStart = (e) => {
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  };

  handleTouchMove = (e) => {
    if (!this.touchStartX || !this.touchStartY) return;
    
    const touchEndX = e.touches[0].clientX;
    const touchEndY = e.touches[0].clientY;
    
    const diffX = this.touchStartX - touchEndX;
    
    // Handle swipe gestures for scene navigation
    if (Math.abs(diffX) > 50) {
      this.navigateToAdjacentScene(diffX > 0 ? 'next' : 'prev');
      this.touchStartX = null;
      this.touchStartY = null;
    }
  };

  // 🔹 Keyboard navigation
  handleKeyDown = (e) => {
    switch(e.key) {
      case 'ArrowLeft':
        this.navigateToAdjacentScene('prev');
        break;
      case 'ArrowRight':
        this.navigateToAdjacentScene('next');
        break;
      case 'Escape':
        this.cancelLinking();
        this.setState({ 
          editingHotspot: null, 
          activeInfoHotspot: null 
        });
        break;
      case ' ':
        this.toggleAutoRotate();
        break;
      case 't':
      case 'T':
        if (this.state.isGuidedTour) {
          this.stopGuidedTour();
        } else {
          this.startGuidedTour();
        }
        break;
    }
  };

  // 🔹 Language support
  changeLanguage = (language) => {
    this.setState({ language });
    this.trackUserInteraction('language_changed', { language });
  };

  t = (key) => {
    return this.translations[this.state.language]?.[key] || key;
  };

  // 🔹 Tour controls
  toggleAutoRotate = () => {
    this.setState(prev => ({
      autoRotate: !prev.autoRotate
    }));
    this.trackUserInteraction('auto_rotate_toggled', { 
      enabled: !this.state.autoRotate 
    });
  };

  toggleMiniMap = () => {
    this.setState(prev => ({
      showMiniMap: !prev.showMiniMap
    }));
  };

  // 🔹 Clear error
  clearError = () => {
    this.setState({ error: null });
  };

  // 🔹 Show info hotspot content
  showInfoHotspot = (hotspot) => {
    this.setState({ activeInfoHotspot: hotspot });
  };

  hideInfoHotspot = () => {
    this.setState({ activeInfoHotspot: null });
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
        onTouchStart: this.handleTouchStart,
        onTouchMove: this.handleTouchMove,
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
              cssClass={`custom-hotspot ${spot.type === HOTSPOT_TYPES.INFO ? 'info-hotspot' : 'nav-hotspot'} ${spot.cssClass || ''}`}
              handleClick={(e) => {
                e.stopPropagation();
                if (spot.type === HOTSPOT_TYPES.INFO) {
                  this.showInfoHotspot(spot);
                } else if (spot.target) {
                  this.changeScene(spot.target);
                }
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
          <h3>⚠️ Unable to load panorama</h3>
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

  // 🔹 Render mini-map
  renderMiniMap() {
    if (!this.state.showMiniMap) return null;

    return (
      <div style={styles.miniMap}>
        <h4 style={{ margin: '0 0 10px 0', textAlign: 'center' }}>🗺️ Tour Map</h4>
        <div style={styles.miniMapItems}>
          {Object.keys(this.state.scenes).map(sceneId => (
            <div
              key={sceneId}
              style={{
                ...styles.miniMapItem,
                ...(sceneId === this.state.currentScene ? styles.miniMapItemActive : {})
              }}
              onClick={() => this.changeScene(sceneId)}
              onKeyPress={(e) => e.key === 'Enter' && this.changeScene(sceneId)}
              tabIndex={0}
              role="button"
              aria-label={`Go to ${this.state.scenes[sceneId].title}`}
            >
              {this.state.scenes[sceneId].thumbnail ? (
                <img 
                  src={this.state.scenes[sceneId].thumbnail} 
                  alt=""
                  style={styles.miniMapThumbnail}
                />
              ) : (
                <div style={styles.miniMapPlaceholder}>📷</div>
              )}
              <span style={styles.miniMapLabel}>
                {this.state.scenes[sceneId].title}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 🔹 Render accessible hotspots for screen readers
  renderAccessibleHotspots() {
    const { currentScene, scenes } = this.state;
    const navigationHotspots = scenes[currentScene].hotspots.filter(
      spot => spot.type === HOTSPOT_TYPES.NAVIGATION || spot.target
    );

    if (navigationHotspots.length === 0) return null;

    return (
      <div className="sr-only" aria-live="polite">
        <h4>Navigation Points:</h4>
        {navigationHotspots.map(hotspot => (
          <button
            key={hotspot.id}
            onClick={() => this.changeScene(hotspot.target)}
            style={{ display: 'block', margin: '5px 0' }}
            aria-label={`Navigate to ${scenes[hotspot.target]?.title}`}
          >
            Go to {scenes[hotspot.target]?.title}
          </button>
        ))}
      </div>
    );
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
      error,
      editingHotspot,
      isGuidedTour,
      tourSpeed,
      isVRMode,
      language,
      showMiniMap,
      activeInfoHotspot
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
            <p>{this.t('processingImage')}</p>
            <p style={{ fontSize: '12px', opacity: 0.7 }}>This may take a few seconds</p>
          </div>
        )}

        {/* Info Hotspot Modal */}
        {activeInfoHotspot && (
          <div style={styles.modalOverlay} onClick={this.hideInfoHotspot}>
            <div style={styles.infoModal} onClick={e => e.stopPropagation()}>
              <button
                onClick={this.hideInfoHotspot}
                style={styles.closeModalButton}
                aria-label="Close information"
              >
                ×
              </button>
              <h3>ℹ️ Information</h3>
              <p>{activeInfoHotspot.content}</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div style={styles.header}>
          <h1 style={{ margin: 0, fontSize: '2.5em', fontWeight: 'bold' }}>🏠 Virtual Property Tour</h1>
          <p style={{ margin: '10px 0 0 0', opacity: 0.9 }}>Immerse yourself in the 360° experience with Street View navigation</p>
          
          {/* Language Selector */}
          <div style={styles.languageSelector}>
            <label htmlFor="language-select">Language: </label>
            <select
              id="language-select"
              value={language}
              onChange={(e) => this.changeLanguage(e.target.value)}
              style={styles.languageSelect}
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </div>
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
          <p style={styles.uploadInfoText}>
            Move cursor around the image to reveal Street View navigation arrows
          </p>
        </div>

        {/* Main Controls */}
        <div style={styles.controlsContainer}>
          <button
            onClick={this.startAddHotspot}
            style={{
              ...styles.tourButton,
              background: isAddingHotspot ? '#ff6b6b' : '#4ecdc4'
            }}
            aria-label={isAddingHotspot ? "Click in the tour to place navigation point" : this.t('addHotspot')}
          >
            {isAddingHotspot ? "📍 Click in Tour to Place Hotspot" : `🔗 ${this.t('addHotspot')}`}
          </button>

          <button
            onClick={() => this.addInfoHotspot(0, 0)}
            style={styles.tourButton}
          >
            ℹ️ Add Info Point
          </button>

          {isRealPanorama && (
            <button
              onClick={this.toggleAutoRotate}
              style={{
                ...styles.tourButton,
                background: autoRotate ? '#45b7d1' : '#96ceb4'
              }}
            >
              {autoRotate ? `⏸️ ${this.t('pauseAutoRotate')}` : `▶️ ${this.t('enableAutoRotate')}`}
            </button>
          )}

          {!isGuidedTour ? (
            <button
              onClick={this.startGuidedTour}
              style={styles.tourButton}
              disabled={Object.keys(scenes).length <= 1}
            >
              🚀 {this.t('startTour')}
            </button>
          ) : (
            <button
              onClick={this.stopGuidedTour}
              style={{ ...styles.tourButton, background: '#e74c3c' }}
            >
              ⏹️ {this.t('stopTour')}
            </button>
          )}

          <button
            onClick={this.toggleMiniMap}
            style={styles.tourButton}
          >
            {showMiniMap ? '🗺️ Hide Map' : '🗺️ Show Map'}
          </button>

          {isVRMode ? (
            <button
              onClick={this.exitVRMode}
              style={styles.tourButton}
            >
              🕶️ Exit VR
            </button>
          ) : (
            <button
              onClick={this.enterVRMode}
              style={styles.tourButton}
            >
              🕶️ VR Mode
            </button>
          )}

          {/* Tour Speed Control */}
          {isGuidedTour && (
            <select
              value={tourSpeed}
              onChange={(e) => this.setTourSpeed(Number(e.target.value))}
              style={styles.speedSelect}
            >
              <option value={TOUR_SPEED.SLOW}>Slow</option>
              <option value={TOUR_SPEED.MEDIUM}>Medium</option>
              <option value={TOUR_SPEED.FAST}>Fast</option>
            </select>
          )}
        </div>

        {/* Scene Navigation */}
        <div style={styles.sceneNavigation}>
          {Object.keys(scenes).map((key) => (
            <div key={key} style={{ position: 'relative' }}>
              <button
                onClick={() => this.changeScene(key)}
                style={{
                  ...styles.sceneButton,
                  background: key === currentScene ? '#e17055' : '#2d3436',
                  transform: key === currentScene ? 'scale(1.05)' : 'scale(1)',
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

        {/* Main Content */}
        <div style={styles.mainContent}>
          {/* Viewer */}
          <div
            ref={this.containerRef}
            style={styles.viewerContainer}
          >
            <div style={{ width: '100%', height: '100%', borderRadius: '17px' }}>
              {this.renderViewer()}
            </div>

            {/* Street View Navigation Arrows */}
            {this.renderStreetViewArrows()}

            {/* Scene Info Overlay */}
            {activeScene && (
              <div style={styles.sceneInfoOverlay}>
                <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '5px' }}>
                  {activeScene.title}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>
                  {isRealPanorama ? this.t('panoramaView') : this.t('enhancedView')}
                  <div style={{ marginTop: '5px', color: '#4ecdc4' }}>
                    Move cursor to reveal navigation arrows
                  </div>
                </div>
              </div>
            )}

            {/* Controls Info */}
            {showControls && activeScene && (
              <div style={styles.controlsInfo}>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <span>🖱️ {this.t('dragToLook')}</span>
                  <span>🔍 {this.t('scrollToZoom')}</span>
                  <span>⬅️➡️ Arrow keys to navigate</span>
                  {isRealPanorama && autoRotate && <span style={{ color: '#4ecdc4' }}>🔄 Auto-rotating</span>}
                  {isGuidedTour && <span style={{ color: '#e74c3c' }}>🚀 Guided tour active</span>}
                  {!isRealPanorama && <span style={{ color: '#f39c12' }}>📱 Image Only</span>}
                </div>
              </div>
            )}
          </div>

          {/* Mini Map */}
          {this.renderMiniMap()}
        </div>

        {/* Data Management */}
        <div style={styles.dataManagement}>
          <button onClick={this.saveTour} style={styles.dataButton}>
            💾 {this.t('saveTour')}
          </button>
          <button onClick={this.loadTour} style={styles.dataButton}>
            📂 {this.t('loadTour')}
          </button>
          <button onClick={this.exportTour} style={styles.dataButton}>
            📤 {this.t('exportTour')}
          </button>
        </div>

        {/* Navigation Hotspots Panel */}
        {activeScene && activeScene.hotspots && activeScene.hotspots.length > 0 && (
          <div style={styles.hotspotsPanel}>
            <h3 style={{ margin: '0 0 20px 0', textAlign: 'center' }}>
              🧭 {this.t('navigationPoints')}
            </h3>
            <div style={styles.hotspotsGrid}>
              {activeScene.hotspots.map((spot) => (
                <div
                  key={spot.id}
                  style={styles.hotspotCard}
                  onClick={() => spot.type === HOTSPOT_TYPES.INFO ? this.showInfoHotspot(spot) : this.changeScene(spot.target)}
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
                  onKeyPress={(e) => e.key === 'Enter' && (spot.type === HOTSPOT_TYPES.INFO ? this.showInfoHotspot(spot) : this.changeScene(spot.target))}
                  aria-label={spot.type === HOTSPOT_TYPES.INFO ? `Show information: ${spot.content}` : `Navigate to ${scenes[spot.target]?.title || 'next location'}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                        <span style={{ 
                          background: spot.type === HOTSPOT_TYPES.INFO ? '#3498db' : '#4ecdc4',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}>
                          {spot.type === HOTSPOT_TYPES.INFO ? 'INFO' : 'NAV'}
                        </span>
                        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                          {spot.type === HOTSPOT_TYPES.INFO ? spot.label : (scenes[spot.target]?.title || "Next Location")}
                        </div>
                      </div>
                      <div style={{ fontSize: '14px', opacity: 0.8 }}>
                        {spot.type === HOTSPOT_TYPES.INFO ? 'Click for details' : (scenes[spot.target]?.isPanorama ? this.t('panoramaView') : this.t('enhancedView'))}
                      </div>
                    </div>
                    <button style={{
                      ...styles.visitButton,
                      background: spot.type === HOTSPOT_TYPES.INFO ? '#3498db' : '#4ecdc4'
                    }}>
                      {spot.type === HOTSPOT_TYPES.INFO ? 'View →' : this.t('visit')}
                    </button>
                  </div>
                  
                  {/* Hotspot Management */}
                  <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        this.removeHotspot(spot.id);
                      }}
                      style={styles.smallButton}
                    >
                      {this.t('remove')}
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
                Connect this point to another location in your virtual tour
              </p>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: '#2c3e50' }}>
                  📸 {this.t('addNewLocation')}
                </label>
                <label style={styles.modalUploadButton}>
                  <input
                    ref={this.fileInputRef}
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
                  🔄 {this.t('linkToExisting')}
                </label>
                <select
                  onChange={this.handleSelectExistingScene}
                  style={styles.sceneSelect}
                  aria-label="Select existing tour location"
                >
                  <option value="">-- Select a tour location --</option>
                  {Object.keys(scenes)
                    .filter(s => s !== currentScene)
                    .map((s) => (
                      <option key={s} value={s}>
                        {scenes[s].title} ({scenes[s].haov === 360 ? this.t('panoramaView') : this.t('enhancedView')})
                      </option>
                    ))}
                </select>
              </div>

              <button
                onClick={this.cancelLinking}
                style={styles.tourButtonDanger}
                aria-label={this.t('cancel')}
              >
                {this.t('cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Accessible Hotspots for Screen Readers */}
        {this.renderAccessibleHotspots()}

        {/* Styles */}
        <style>{`
          .pnlm-container canvas {
            pointer-events: auto !important;
          }
          
          .custom-hotspot {
            width: 40px;
            height: 40px;
            background-size: contain;
            background-repeat: no-repeat;
            filter: drop-shadow(0 2px 8px rgba(0,0,0,0.7));
            border-radius: 50%;
            pointer-events: auto !important;
            z-index: 10;
          }
          
          .nav-hotspot {
            background-image: url(${arrowIcon});
          }
          
          .info-hotspot {
            background-image: url(${infoIcon});
          }
          
          .white-hotspot {
            background: white !important;
            border: 2px solid #4ecdc4;
            box-shadow: 0 0 10px rgba(78, 205, 196, 0.8);
          }
          
          .white-hotspot::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 100%;
            height: 100%;
            background: radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 70%);
            border-radius: 50%;
            animation: pulse 2s infinite;
            pointer-events: none;
            z-index: -1;
          }
          
          .custom-hotspot::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 100%;
            height: 100%;
            border-radius: 50%;
            animation: pulse 2s infinite;
            pointer-events: none;
            z-index: -1;
          }
          
          .nav-hotspot::after {
            background: radial-gradient(circle, rgba(78, 205, 196, 0.8) 0%, rgba(78, 205, 196, 0) 70%);
          }
          
          .info-hotspot::after {
            background: radial-gradient(circle, rgba(52, 152, 219, 0.8) 0%, rgba(52, 152, 219, 0) 70%);
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
          
          @keyframes pulse {
            0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            50% { transform: translate(-50%, -50%) scale(1.5); opacity: 0.5; }
            100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          }
          
          .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
          }
          
          @media (max-width: 768px) {
            .controls-container {
              flex-direction: column;
              align-items: stretch;
            }
            
            .scene-navigation {
              flex-wrap: wrap;
            }
            
            .hotspots-grid {
              grid-template-columns: 1fr;
            }
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
    color: 'white',
    position: 'relative'
  },
  languageSelector: {
    position: 'absolute',
    top: '20px',
    right: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  languageSelect: {
    padding: '5px 10px',
    borderRadius: '5px',
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'rgba(255,255,255,0.1)',
    color: 'white'
  },
  quickUploadContainer: {
    background: 'linear-gradient(135deg, #2c3e50, #34495e)',
    padding: '20px',
    borderRadius: '15px',
    marginBottom: '20px',
    border: '1px solid rgba(255,255,255,0.1)'
  },
  uploadButtons: {
    display: 'flex',
    gap: '15px',
    justifyContent: 'center',
    flexWrap: 'wrap'
  },
  uploadButton: {
    background: 'linear-gradient(135deg, #4ecdc4, #44a08d)',
    color: 'white',
    padding: '15px 25px',
    borderRadius: '25px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 'bold',
    transition: 'all 0.3s ease',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '5px',
    minWidth: '150px'
  },
  uploadSubtext: {
    fontSize: '12px',
    opacity: 0.8,
    fontWeight: 'normal'
  },
  uploadInfoText: {
    textAlign: 'center',
    color: '#bdc3c7',
    fontSize: '14px',
    marginTop: '15px',
    fontStyle: 'italic'
  },
  modalUploadButton: {
    background: 'linear-gradient(135deg, #4ecdc4, #44a08d)',
    color: 'white',
    padding: '15px 25px',
    borderRadius: '25px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 'bold',
    transition: 'all 0.3s ease',
    display: 'block',
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
  sceneNavigation: {
    marginBottom: '20px',
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center'
  },
  mainContent: {
    display: 'grid',
    gridTemplateColumns: '1fr 300px',
    gap: '20px',
    alignItems: 'start'
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
  miniMap: {
    background: 'linear-gradient(135deg, #2c3e50, #34495e)',
    padding: '15px',
    borderRadius: '15px',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.1)'
  },
  miniMapItems: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  miniMapItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    background: 'rgba(255,255,255,0.1)'
  },
  miniMapItemActive: {
    background: 'rgba(78, 205, 196, 0.3)',
    border: '1px solid #4ecdc4'
  },
  miniMapThumbnail: {
    width: '40px',
    height: '25px',
    borderRadius: '4px',
    objectFit: 'cover'
  },
  miniMapPlaceholder: {
    width: '40px',
    height: '25px',
    borderRadius: '4px',
    background: 'rgba(255,255,255,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px'
  },
  miniMapLabel: {
    fontSize: '14px',
    fontWeight: 'bold'
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
  dataManagement: {
    marginTop: '20px',
    display: 'flex',
    gap: '10px',
    justifyContent: 'center',
    flexWrap: 'wrap'
  },
  dataButton: {
    padding: '10px 15px',
    borderRadius: '20px',
    border: 'none',
    background: 'linear-gradient(135deg, #95a5a6, #7f8c8d)',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    transition: 'all 0.3s ease'
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
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
    border: 'none',
    color: 'white',
    padding: '10px 20px',
    borderRadius: '25px',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: 'all 0.3s ease'
  },
  smallButton: {
    padding: '5px 10px',
    borderRadius: '15px',
    border: 'none',
    background: 'rgba(255,255,255,0.2)',
    color: 'white',
    cursor: 'pointer',
    fontSize: '12px',
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
    boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
    background: 'linear-gradient(135deg, #4ecdc4, #44a08d)'
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
  speedSelect: {
    padding: '10px 15px',
    borderRadius: '20px',
    border: 'none',
    background: 'linear-gradient(135deg, #f39c12, #e67e22)',
    color: 'white',
    fontWeight: 'bold',
    cursor: 'pointer'
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
  infoModal: {
    background: "linear-gradient(135deg, #ffffff, #f8f9fa)",
    padding: "25px",
    borderRadius: "15px",
    width: "400px",
    maxWidth: "90vw",
    boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.2)",
    position: 'relative'
  },
  closeModalButton: {
    position: 'absolute',
    top: '10px',
    right: '15px',
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#7f8c8d'
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