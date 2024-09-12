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
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css';
    link.rel = 'stylesheet';
    link.onload = resolve;
    link.onerror = reject;
    document.head.appendChild(link);
  });
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
let isDragging = false;
let startX, startY;
let translateX = 0, translateY = 0;

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
    addImageEventListeners(newImage);
    
    // 更新缩略图
    updateThumbnails();
  }, 300);
}

// 新增函数，用于添加图片事件监听器
function addImageEventListeners(image) {
  image.addEventListener('wheel', handleWheel, { passive: false });
  image.addEventListener('mousedown', startDrag);
  image.addEventListener('mousemove', drag);
  image.addEventListener('mouseup', endDrag);
  image.addEventListener('mouseleave', endDrag);
  image.addEventListener('mouseenter', () => {
    image.style.cursor = 'grab';
  });
  image.addEventListener('mouseleave', () => {
    image.style.cursor = 'default';
  });
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

async function toggleGalleryMode() {
  if (!galleryMode) {
    try {
      await loadFontAwesome();
      console.log('Font Awesome loaded successfully');
      setIconStyles();
      if (checkFontAwesome()) {
        console.log('Font Awesome is working correctly');
      } else {
        console.warn('Font Awesome may not be working correctly');
      }
    } catch (error) {
      console.error('Failed to load Font Awesome:', error);
    }
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
      alert('没有找到合适的片');
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
        <button id="reset-image" class="nav-btn">复原</button>
      </div>
      <div class="navbar-center">
        <button id="rotate-left" class="nav-btn"><i class="fas fa-undo"></i>向左旋转</button>
        <button id="rotate-right" class="nav-btn"><i class="fas fa-redo"></i>向右旋转</button>
        <button id="flip-horizontal" class="nav-btn"><i class="fas fa-arrows-alt-h"></i>左右翻转</button>
        <button id="flip-vertical" class="nav-btn"><i class="fas fa-arrows-alt-v"></i>上下翻转</button>
      </div>
      <div class="navbar-right">
        <button id="download-all" class="nav-btn"><i class="fas fa-download"></i>下载所有图片</button>
        <button id="exit-gallery" class="nav-btn">退出</button>
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
    <div class="gallery-thumbnails" style="overflow-x: auto; white-space: nowrap; scrollbar-width: thin;">
      ${images.map((img, index) => {
        const thumbnailSrc = img.src || img.dataset.src || '';
        return `<img src="${thumbnailSrc}" alt="Thumbnail" class="thumbnail ${index === currentImageIndex ? 'active' : ''}" data-index="${index}" style="display: inline-block; margin-right: 5px;">`;
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
  document.getElementById('reset-image').addEventListener('click', resetImage);

  document.getElementById('zoom-select').addEventListener('change', (e) => {
    scale = parseFloat(e.target.value);
    applyImageTransform(true);
  });

  overlay.addEventListener('wheel', handleWheel, { passive: false });

  updateThumbnailListeners();

  const galleryImage = document.getElementById('gallery-image');
  addImageEventListeners(galleryImage);

  // 初始化缩略图选中状态和滚动位置
  updateThumbnailSelection();
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
  
  // 强制重计算布局
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
  const thumbnails = document.querySelectorAll('.thumbnail');
  thumbnails.forEach((thumb, index) => {
    thumb.classList.toggle('active', index === currentImageIndex);
  });

  // 滚动到当前选中的缩略图
  const activeThumb = thumbnails[currentImageIndex];
  if (activeThumb) {
    const thumbnailsContainer = document.querySelector('.gallery-thumbnails');
    const containerWidth = thumbnailsContainer.clientWidth;
    const thumbLeft = activeThumb.offsetLeft;
    const thumbWidth = activeThumb.clientWidth;
    
    thumbnailsContainer.scrollLeft = thumbLeft - (containerWidth / 2) + (thumbWidth / 2);
  }
}

function resetImageTransform() {
  scale = 1;
  rotation = 0;
  flipHorizontal = false;
  flipVertical = false;
  translateX = 0;
  translateY = 0;
  applyImageTransform();
  updateZoomSelect();
}

function applyImageTransform(withTransition = false) {
  const galleryImage = document.getElementById('gallery-image');
  if (galleryImage) {
    if (withTransition) {
      galleryImage.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)';
    } else {
      galleryImage.style.transition = '';
    }
    galleryImage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${flipHorizontal ? -scale : scale}, ${flipVertical ? -scale : scale}) rotate(${rotation}deg)`;
    updateZoomSelect();
    
    if (withTransition) {
      setTimeout(() => {
        galleryImage.style.transition = '';
      }, 300);
    }
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
    applyImageTransform(true); // 添加过渡效果
  });
}

function rotateImage(angle) {
  rotation = (rotation + angle + 360) % 360;
  applyImageTransform(true); // 添加过渡效果
}

function flipImage(direction) {
  if (direction === 'horizontal') {
    flipHorizontal = !flipHorizontal;
  } else if (direction === 'vertical') {
    flipVertical = !flipVertical;
  }
  applyImageTransform(true); // 添加过渡效果
}

function startDrag(e) {
  isDragging = true;
  startX = e.clientX - translateX;
  startY = e.clientY - translateY;
  e.preventDefault();
  document.body.style.cursor = 'grabbing'; // 设置整个 body 的光标样式为抓取状态
  const galleryImage = document.getElementById('gallery-image');
  if (galleryImage) {
    galleryImage.style.cursor = 'grabbing';
  }
}

function drag(e) {
  if (isDragging) {
    e.preventDefault();
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    applyImageTransform(false); // 不添加过渡效果，保持拖拽流畅
  }
}

function endDrag() {
  isDragging = false;
  document.body.style.cursor = ''; // 恢复 body 的默认光标样式
  const galleryImage = document.getElementById('gallery-image');
  if (galleryImage) {
    galleryImage.style.cursor = 'grab';
  }
}

function resetImage() {
  scale = 1;
  rotation = 0;
  flipHorizontal = false;
  flipVertical = false;
  translateX = 0;
  translateY = 0;
  applyImageTransform(true); // 添加过渡效果
  updateZoomSelect();
}

function scrollToCurrentImage() {
  const currentImage = images[currentImageIndex];
  if (currentImage) {
    const rect = currentImage.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const targetScrollTop = rect.top + scrollTop - window.innerHeight / 2 + rect.height / 2;
    
    window.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth'
    });
  }
}

// 初始化时添加消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "enterGallery") {
    toggleGalleryMode();
  }
});

// 将这个函数移到文件的顶部，其他全局函数的附近
function handleWheel(e) {
  e.preventDefault();
  const factor = Math.pow(1.001, -e.deltaY);
  zoomImage(factor);
}

// 将这些函数移文件的顶部，其他全局函数的附近
function startDrag(e) {
  isDragging = true;
  startX = e.clientX - translateX;
  startY = e.clientY - translateY;
  e.preventDefault();
  document.body.style.cursor = 'grabbing'; // 设置整个 body 的光标样式为抓取状态
  const galleryImage = document.getElementById('gallery-image');
  if (galleryImage) {
    galleryImage.style.cursor = 'grabbing';
  }
}

function drag(e) {
  if (isDragging) {
    e.preventDefault();
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    applyImageTransform(false); // 不添加过渡效果，保持拖拽流畅
  }
}

function endDrag() {
  isDragging = false;
  document.body.style.cursor = ''; // 恢复 body 的默认光标样式
  const galleryImage = document.getElementById('gallery-image');
  if (galleryImage) {
    galleryImage.style.cursor = 'grab';
  }
}

function setIconStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .nav-btn i {
      display: inline-block !important;
      width: auto !important;
      height: auto !important;
      font-size: 16px !important;
      margin-right: 5px !important;
      font-style: normal !important;
    }
    .nav-btn i::before {
      display: inline-block !important;
    }
    .icon-btn::before {
      content: '' !important;
    }
    #gallery-image {
      cursor: move; /* 默认显示移动光标 */
      cursor: grab; /* 现代浏览器中显示抓手光标 */
    }

    #gallery-image:active {
      cursor: grabbing; /* 拖动时显示抓取状态的光标 */
    }
  `;
  document.head.appendChild(style);
}

function checkFontAwesome() {
  const testIcon = document.createElement('i');
  testIcon.className = 'fas fa-user';
  testIcon.style.visibility = 'hidden';
  document.body.appendChild(testIcon);
  const isFontAwesomeLoaded = window.getComputedStyle(testIcon, ':before').getPropertyValue('content') !== '';
  document.body.removeChild(testIcon);
  return isFontAwesomeLoaded;
}