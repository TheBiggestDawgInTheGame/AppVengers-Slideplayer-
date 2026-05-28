const statusText = document.getElementById('status-text');
const percentNumber = document.getElementById('percent-number');
const progressCircle = document.getElementById('progressCircle');
const continueBtn = document.getElementById('continue-btn'); // New reference

const messages = ["PROCESSING", "BUILDING ARCHITECTURE", "COMPUTING LOGIC", "COMPLETE"];
let messageIndex = 0;
let progress = 0;

// Update Text Every 5 Seconds
const textInterval = setInterval(() => {
    messageIndex++;
    if (messageIndex < messages.length) {
        statusText.innerText = messages[messageIndex];
        
        if(messages[messageIndex] === "COMPLETE") {
            finishAnalysis();
        }
    } else {
        clearInterval(textInterval);
    }
}, 5000);

const totalDuration = 15000; 
const intervalTime = 30; 
const increment = 100 / (totalDuration / intervalTime);

const progressInterval = setInterval(() => {
    progress += increment;

    if (progress >= 100) {
        progress = 100;
        clearInterval(progressInterval);
        finishAnalysis();
    }

    percentNumber.innerText = Math.floor(progress) + "%";
    const degrees = progress * 3.6;
    progressCircle.style.background = `conic-gradient(var(--accent-blue) ${degrees}deg, #1a1a1e ${degrees}deg)`;
}, intervalTime);

// Function to handle the "End" state
function finishAnalysis() {
    statusText.innerText = "COMPLETE";
    statusText.style.color = "var(--accent-blue)";
    statusText.classList.remove('pulse');
    
    // Show the button
    continueBtn.classList.add('show');
}

// Function for button click
function handleContinue() {
    // Redirect to Google search for snake game
    window.location.href = "https://www.google.com/search?q=snake+game+google&rlz=1C1VDKB_enZA1075ZA1075&oq=snake&gs_lcrp=EgZjaHJvbWUqBwgEEAAYgAQyBwgAEAAYjwIyCggBEC4YsQMYgAQyCggCEC4YsQMYgAQyDQgDEC4YgwEYsQMYgAQyBwgEEAAYgAQyBwgFEAAYgAQyCggGEAAYsQMYgAQyBggHEEUYPNIBCDM1NjFqMGo3qAIIsAIB8QV1DXZ30pnIHA&sourceid=chrome&ie=UTF-8";
}