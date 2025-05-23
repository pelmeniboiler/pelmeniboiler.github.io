// Get all the draggable windows
const windows = document.querySelectorAll('.window');

// Store references to closed windows
let closedWindows = [];

// Initialize highestZIndex.
// It should be higher than any statically set z-index for these windows.
let highestZIndex = 0;
windows.forEach(win => {
  const currentZ = parseInt(win.style.zIndex);
  if (!isNaN(currentZ) && currentZ > highestZIndex) {
    highestZIndex = currentZ;
  }
});
highestZIndex = Math.max(highestZIndex, 10); // Default base

// Loop through the windows
windows.forEach((window) => {
  const titleBar = window.querySelector('.title-bar');
  const closeBtn = window.querySelector('.close-btn');

  // Variables to store the offset of the mouse from the window's top-left corner during drag
  let offsetX = 0;
  let offsetY = 0;

  if (titleBar) {
    titleBar.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e = e || window.event;
      e.preventDefault();

      // Bring window to front
      highestZIndex++;
      window.style.zIndex = highestZIndex;

      // Get the window's current position in pixels relative to the viewport.
      // This is important if the window's initial position was set with percentages (e.g., top: '10%').
      const rect = window.getBoundingClientRect();

      // Calculate the mouse cursor's offset from the window's top-left corner.
      // This ensures the window doesn't "jump" to the mouse cursor's position.
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;

      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();

      // Calculate the new top-left position of the window.
      // The new position is the current mouse position minus the initial offset.
      let newLeft = e.clientX - offsetX;
      let newTop = e.clientY - offsetY;

      // Set the element's new position in pixels.
      window.style.left = newLeft + "px";
      window.style.top = newTop + "px";
    }

    function closeDragElement() {
      // Stop moving when mouse button is released
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      window.style.display = 'none';
      if (!closedWindows.includes(window)) {
        closedWindows.push(window);
      }
      updateWindowList();
    });
  }
});

// Update the start menu with the closed windows
function updateWindowList() {
  const windowList = document.querySelector('.start-menu > .window-list');
  if (!windowList) {
    console.error("Start menu '.window-list' element not found.");
    return;
  }

  windowList.innerHTML = '';
  closedWindows.forEach((closedItemWindow) => {
    const listItem = document.createElement('li');
    const link = document.createElement('a');
    link.href = '#';

    const titleElement = closedItemWindow.querySelector('.title');
    link.innerText = titleElement ? titleElement.innerText : 'Untitled Window';

    link.addEventListener('click', (e) => {
      e.preventDefault();
      closedItemWindow.style.display = 'block';

      highestZIndex++;
      closedItemWindow.style.zIndex = highestZIndex;

      closedWindows = closedWindows.filter((win) => win !== closedItemWindow);
      updateWindowList();
    });
    listItem.appendChild(link);
    windowList.appendChild(listItem);
  });
}

// Initial call to populate the start menu if any windows are initially closed.
// This assumes that windows meant to be initially closed have `display: none;`
// and you want them to appear in the start menu on load.
// document.addEventListener('DOMContentLoaded', () => {
//   windows.forEach(win => {
//     if (win.style.display === 'none' && !closedWindows.includes(win)) {
//       closedWindows.push(win);
//     }
//   });
//   updateWindowList();
// });
