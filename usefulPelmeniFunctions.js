    // Get all the draggable windows
const windows = document.querySelectorAll('.window');

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
});
});
function playAudio() {
var audio = document.getElementById("audio");
audio.play();
document.getElementById("welcome").style.display = "none";
}