// Get all the draggable windows
const windows = document.querySelectorAll('.window');

// Store references to closed windows
let closedWindows = [];

// Loop through the windows
windows.forEach((window) => {
  // Get the title bar and close button
  const titleBar = window.querySelector('.title-bar');
  const closeBtn = window.querySelector('.close-btn');

  // Set the initial position of the window
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  titleBar.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    // Get the mouse cursor position at startup
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    // Call a function whenever the cursor moves
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    // Calculate the new cursor position
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    // Set the element's new position
    window.style.top = (window.offsetTop - pos2) + "px";
    window.style.left = (window.offsetLeft - pos1) + "px";
  }

  function closeDragElement() {
    // Stop moving when mouse button is released
    document.onmouseup = null;
    document.onmousemove = null;
  }

  // Set up the close button
  closeBtn.addEventListener('click', () => {
    window.style.display = 'none';
    // Add window to list of closed windows
    closedWindows.push(window);
    // Update the start menu with the closed windows
    updateWindowList();
  });
});

// Update the start menu with the closed windows
function updateWindowList() {
  const windowList = document.querySelector('.start-menu > .window-list');
  // Clear the current start menu items
  windowList.innerHTML = '';
  // Add a new list item for each closed window
  closedWindows.forEach((window) => {
    const listItem = document.createElement('li');
    const link = document.createElement('a');
    link.href = '#';
    link.innerText = window.querySelector('.title').innerText;
    // Restore the window when clicked
    link.addEventListener('click', () => {
      window.style.display = 'block';
      // Remove the window from the list of closed windows
      closedWindows = closedWindows.filter((closedWindow) => {
        return closedWindow !== window;
      });
      // Update the window list with the closed windows
      updateWindowList();
    });
    listItem.appendChild(link);
    windowList.appendChild(listItem);
  });
}
