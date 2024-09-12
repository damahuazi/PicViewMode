function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(src);
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function loadFontAwesome() {
  const link = document.createElement('link');
  link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css';
  link.rel = 'stylesheet';
  document.head.appendChild(link);
}

let galleryMode = false;
let currentImageIndex = 0;
let images = [];
let scale = 1;
let rotation = 0;
let flipHorizontal = false;
let flipVertical = false;
let isChangingImage = false;
let imageCheckInterval;
let imageCheckCount = 0;
const MAX_IMAGE_CHECKS = 10;
let lastImageCount = 0;
let noNewImagesCount = 0;
const MAX_NO_NEW_IMAGES = 3;
let imageUrls = new Set();

function changeImage(direction) {
  if (isChangingImage || !galleryMode) return;
  isChangingImage = true;

  const newIndex = (currentImageIndex + direction + images.length) % images.length;
  
  const galleryContent = document.querySelector('.gallery-content');
  const oldImage = document.getElementById('gallery-image');
  
  const newImage = document.createElement('img');
  newImage.src = images[newIndex].src;
  newImage.alt = "Gallery Image";
  newImage.id = "new-gallery-image";
  
  newImage.style.opacity = '0';
  newImage.style.transform = `translateX(${direction > 0 ? '100%' : '-100%'})`;
  
  galleryContent.appendChild(newImage);
  
  // 强制重排
  newImage.offsetHeight;
  
  newImage.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  newImage.style.opacity = '1';
  newImage.style.transform = 'translateX(0)';
  
  if (oldImage) {
    oldImage.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    oldImage.style.opacity = '0';
    oldImage.style.transform = `translateX(${direction > 0 ? '-100%' : '100%'})`;
  }
  
  setTimeout(() => {
    if (oldImage) {
      oldImage.remove();
    }
    newImage.id = 'gallery-image';
    newImage.style.transition = '';
    newImage.style.transform = '';
    currentImageIndex = newIndex;
    updateThumbnailSelection();
    resetImageTransform();
    isChangingImage = false;
    scrollToCurrentImage();
    
    // 重新添加事件监听器
    newImage.addEventListener('wheel', handleWheel, { passive: false });
    
    // 更新缩略图
    updateThumbnails();
  }, 300);
}

function updateThumbnails() {
  const thumbnailsContainer = document.querySelector('.gallery-thumbnails');
  thumbnailsContainer.innerHTML = images.map((img, index) => {
    const thumbnailSrc = img.src || img.dataset.src || '';
    return `<img src="${thumbnailSrc}" alt="Thumbnail" class="thumbnail ${index === currentImageIndex ? 'active' : ''}" data-index="${index}">`;
  }).join('');
  
  updateThumbnailListeners();
}

function updateThumbnailListeners() {
  document.querySelectorAll('.thumbnail').forEach(thumb => {
    thumb.addEventListener('click', (e) => {
      const newIndex = parseInt(e.target.dataset.index);
      if (newIndex !== currentImageIndex) {
        changeImage(newIndex - currentImageIndex);
      }
    });
  });
}

function handleKeyPress(e) {
  if (!galleryMode) return;

  switch (e.key) {
    case 'Escape':
      removeGalleryOverlay();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      changeImage(-1);
      break;
    case 'ArrowRight':
      e.preventDefault();
      changeImage(1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      zoomImage(1.2); // 放大幅度增加
      break;
    case 'ArrowDown':
      e.preventDefault();
      zoomImage(0.8); // 缩小幅度增加
      break;
  }
}

function toggleGalleryMode() {
  if (!galleryMode) {
    loadFontAwesome();
    simulateScroll();
    imageUrls.clear();
    images = getImages();
    if (images.length > 0) {
      createGalleryOverlay();
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      document.body.classList.add('gallery-mode');
      galleryMode = true;
      imageCheckCount = 0;
      noNewImagesCount = 0;
      lastImageCount = images.length;
      imageCheckInterval = setInterval(checkForNewImages, 2000);
      document.addEventListener('keydown', handleKeyPress);
    } else {
      alert('没有找到合适的图片');
    }
  } else {
    removeGalleryOverlay();
  }
}

function getImages() {
  let allImages = [];
  
  if (window.location.hostname.includes('confluence')) {
    allImages = Array.from(document.querySelectorAll('.wiki-content img, .confluence-content img'));
  } else if (window.location.hostname.includes('behance.net')) {
    allImages = Array.from(document.querySelectorAll('.Project-coverImage img, .Project-module img, .ImageElement-root-kir img, .js-lightbox-slide-content img'));
  } else {
    const mainContent = document.querySelector('main') || document.querySelector('article') || document.body;
    allImages = Array.from(mainContent.querySelectorAll('img'));
  }
  
  return allImages.filter(img => {
    const rect = img.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0 && img.style.display !== 'none' && img.style.visibility !== 'hidden';
    const minSize = 100;
    const hasSize = (img.naturalWidth > minSize && img.naturalHeight > minSize) || (img.width > minSize && img.height > minSize);
    const isLoaded = img.complete && img.naturalHeight !== 0;
    const hasSrc = img.src && img.src.length > 0 && !img.src.startsWith('data:');
    const isNotIcon = img.width > 48 && img.height > 48;
    const isNewImage = !imageUrls.has(img.src);
    
    if (isVisible && hasSize && (isLoaded || hasSrc) && isNotIcon && isNewImage) {
      imageUrls.add(img.src);
      return true;
    }
    return false;
  });
}

function createGalleryOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'gallery-overlay';
  overlay.innerHTML = `
    <div class="gallery-navbar">
      <div class="navbar-left">
        <button id="zoom-out" class="nav-btn"><i class="fas fa-search-minus"></i></button>
        <select id="zoom-select" class="zoom-select">
          <option value="0.5">50%</option>
          <option value="1" selected>100%</option>
          <option value="1.5">150%</option>
          <option value="2">200%</option>
          <option value="3">300%</option>
        </select>
        <button id="zoom-in" class="nav-btn"><i class="fas fa-search-plus"></i></button>
      </div>
      <div class="navbar-center">
        <button id="rotate-left" class="nav-btn"><i class="fas fa-undo"></i>向左旋转</button>
        <button id="rotate-right" class="nav-btn"><i class="fas fa-redo"></i>向右旋转</button>
        <button id="flip-horizontal" class="nav-btn"><i class="fas fa-arrows-alt-h"></i>左右翻转</button>
        <button id="flip-vertical" class="nav-btn"><i class="fas fa-arrows-alt-v"></i>上下翻转</button>
      </div>
      <div class="navbar-right">
        <button id="download-all" class="nav-btn"><i class="fas fa-download"></i>下载所有图片</button>
        <button id="exit-gallery" class="nav-btn"><i class="fas fa-times"></i>退出</button>
      </div>
    </div>
    <button id="prev-button" class="nav-button prev-button">
      <i class="fas fa-chevron-left"></i>
    </button>
    <button id="next-button" class="nav-button next-button">
      <i class="fas fa-chevron-right"></i>
    </button>
    <div class="gallery-content">
      <img src="${images[currentImageIndex].src}" alt="Gallery Image" id="gallery-image">
    </div>
    <div class="gallery-thumbnails">
      ${images.map((img, index) => {
        const thumbnailSrc = img.src || img.dataset.src || '';
        return `<img src="${thumbnailSrc}" alt="Thumbnail" class="thumbnail ${index === currentImageIndex ? 'active' : ''}" data-index="${index}">`;
      }).join('')}
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('prev-button').addEventListener('click', () => changeImage(-1));
  document.getElementById('next-button').addEventListener('click', () => changeImage(1));
  document.getElementById('zoom-in').addEventListener('click', () => zoomImage(1.2));
  document.getElementById('zoom-out').addEventListener('click', () => zoomImage(0.8));
  document.getElementById('rotate-left').addEventListener('click', () => rotateImage(-90));
  document.getElementById('rotate-right').addEventListener('click', () => rotateImage(90));
  document.getElementById('flip-horizontal').addEventListener('click', () => flipImage('horizontal'));
  document.getElementById('flip-vertical').addEventListener('click', () => flipImage('vertical'));
  document.getElementById('download-all').addEventListener('click', downloadAllImages);
  document.getElementById('exit-gallery').addEventListener('click', removeGalleryOverlay);

  document.getElementById('zoom-select').addEventListener('change', (e) => {
    scale = parseFloat(e.target.value);
    applyImageTransform();
  });

  function handleWheel(e) {
    e.preventDefault();
    const factor = Math.pow(1.001, -e.deltaY);
    zoomImage(factor);
  }

  overlay.addEventListener('wheel', handleWheel, { passive: false });

  updateThumbnailListeners();

  const galleryImage = document.getElementById('gallery-image');
  galleryImage.addEventListener('wheel', handleWheel, { passive: false });

  overlay.addEventListener('wheel', handleWheel, { passive: false });
}

function removeGalleryOverlay() {
  const overlay = document.querySelector('.gallery-overlay');
  if (overlay) {
    overlay.remove();
  }
  document.removeEventListener('keydown', handleKeyPress);
  
  // 恢复原网页的滚动状态
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  
  // 移除 gallery-mode 类
  document.body.classList.remove('gallery-mode');
  
  // 重置所有状态
  galleryMode = false;
  currentImageIndex = 0;
  images = [];
  scale = 1;
  rotation = 0;
  flipHorizontal = false;
  flipVertical = false;
  isChangingImage = false;
  clearInterval(imageCheckInterval);
  imageCheckCount = 0;
  noNewImagesCount = 0;
  lastImageCount = 0;
  imageUrls.clear();
  
  // 强制重新计算布局
  window.dispatchEvent(new Event('resize'));
}

function updateGalleryImage() {
  const galleryImage = document.getElementById('gallery-image');
  if (galleryImage) {
    galleryImage.style.opacity = '0';
    setTimeout(() => {
      galleryImage.src = images[currentImageIndex].src;
      resetImageTransform();
      galleryImage.style.opacity = '1';
    }, 300);
  }
}

async function downloadAllImages() {
  try {
    const zip = new JSZip();
    const promises = [];

    images.forEach((img, index) => {
      const promise = fetch(img.src)
        .then(response => {
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          return response.blob();
        })
        .then(blob => {
          const fileName = `image_${index + 1}.${getFileExtension(img.src)}`;
          zip.file(fileName, blob);
        })
        .catch(error => {
          console.error(`Error fetching image ${img.src}:`, error);
          zip.file(`failed_image_${index + 1}.txt`, `Failed to download: ${img.src}\nError: ${error.message}`);
        });
      promises.push(promise);
    });

    await Promise.all(promises);

    const content = await zip.generateAsync({type:"blob"});
    const url = URL.createObjectURL(content);
    chrome.runtime.sendMessage({
      action: "downloadZip",
      url: url,
      filename: "gallery_images.zip"
    });
  } catch (error) {
    console.error('Error in downloadAllImages:', error);
    alert(`下载图片时出错: ${error.message}`);
  }
}

function getFileExtension(url) {
  const extension = url.split('.').pop().split(/[#?]/)[0].toLowerCase();
  return extension === 'jpg' || extension === 'jpeg' || extension === 'png' || extension === 'gif' ? extension : 'jpg';
}

function simulateScroll() {
  const scrollHeight = Math.max(
    document.body.scrollHeight, document.documentElement.scrollHeight,
    document.body.offsetHeight, document.documentElement.offsetHeight,
    document.body.clientHeight, document.documentElement.clientHeight
  );
  
  let currentScroll = 0;
  const scrollStep = window.innerHeight;
  const scrollInterval = setInterval(() => {
    if (currentScroll < scrollHeight) {
      window.scrollTo(0, currentScroll);
      currentScroll += scrollStep;
    } else {
      clearInterval(scrollInterval);
      window.scrollTo(0, 0);
    }
  }, 100);
}

function checkForNewImages() {
  if (imageCheckCount >= MAX_IMAGE_CHECKS || noNewImagesCount >= MAX_NO_NEW_IMAGES) {
    clearInterval(imageCheckInterval);
    return;
  }

  const newImages = getImages();
  const newImageCount = newImages.length - images.length;
  
  if (newImageCount > 0) {
    const addedImages = newImages.slice(images.length);
    images = newImages;
    addNewImagesToGallery(addedImages);
    lastImageCount = images.length;
    noNewImagesCount = 0;
  } else {
    noNewImagesCount++;
  }

  imageCheckCount++;
}

function addNewImagesToGallery(newImages) {
  const thumbnailsContainer = document.querySelector('.gallery-thumbnails');
  newImages.forEach((img, index) => {
    const thumbnailSrc = img.src || img.dataset.src || '';
    const thumbnail = document.createElement('img');
    thumbnail.src = thumbnailSrc;
    thumbnail.alt = "Thumbnail";
    thumbnail.className = "thumbnail";
    thumbnail.dataset.index = images.length - newImages.length + index;
    thumbnailsContainer.appendChild(thumbnail);
  });
  updateThumbnailListeners();
  
  document.querySelectorAll('.thumbnail').forEach((thumb, index) => {
    thumb.dataset.index = index;
  });
}

function updateThumbnailSelection() {
  document.querySelectorAll('.thumbnail').forEach((thumb, index) => {
    thumb.classList.toggle('active', index === currentImageIndex);
  });
}

function resetImageTransform() {
  scale = 1;
  rotation = 0;
  flipHorizontal = false;
  flipVertical = false;
  applyImageTransform();
  updateZoomSelect();
}

function applyImageTransform() {
  const galleryImage = document.getElementById('gallery-image');
  if (galleryImage) {
    galleryImage.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)';
    galleryImage.style.transform = `scale(${flipHorizontal ? -scale : scale}, ${flipVertical ? -scale : scale}) rotate(${rotation}deg)`;
    updateZoomSelect();
    
    // 在过渡结束后移除 transition 属性，以避免影响其他变换
    setTimeout(() => {
      galleryImage.style.transition = '';
    }, 300);
  }
}

function updateZoomSelect() {
  const zoomSelect = document.getElementById('zoom-select');
  if (!zoomSelect) return;

  const roundedScale = Math.round(scale * 100) / 100;
  
  if (!Array.from(zoomSelect.options).some(option => parseFloat(option.value) === roundedScale)) {
    const newOption = new Option(`${(roundedScale * 100).toFixed(0)}%`, roundedScale.toString());
    zoomSelect.add(newOption);
  }
  
  zoomSelect.value = roundedScale.toString();
}

function zoomImage(factor) {
  const targetScale = scale * factor;
  scale = Math.max(0.1, Math.min(5, targetScale));
  requestAnimationFrame(() => {
    applyImageTransform();
  });
}

function rotateImage(angle) {
  rotation = (rotation + angle + 360) % 360;
  applyImageTransform();
}

function flipImage(direction) {
  if (direction === 'horizontal') {
    flipHorizontal = !flipHorizontal;
  } else if (direction === 'vertical') {
    flipVertical = !flipVertical;
  }
  applyImageTransform();
}

// 初始化时添加消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "enterGallery") {
    toggleGalleryMode();
  }
});