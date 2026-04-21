# Quiz Game

A fun and interactive web-based quiz game built with HTML, CSS, and JavaScript.

## Features

- 🎮 **Interactive Quiz Interface** - Beautiful, responsive design
- 📊 **Score Tracking** - Real-time score updates and progress bar
- ✅ **Immediate Feedback** - See if your answer is correct right away
- 🔙 **Navigation** - Move back and forth through questions
- 📈 **Performance Summary** - Get a detailed results screen with your score and customized messages
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile devices

## How to Play

1. Open `index.html` in your web browser
2. Click "Start Quiz" to begin
3. Read each question and select your answer
4. Use "Previous" and "Next" buttons to navigate
5. Your score updates automatically as you answer
6. Complete the quiz to see your final results
7. Click "Try Again" to restart and try for a better score

## Files

- **index.html** - Main HTML structure and interface
- **style.css** - Styling and responsive design
- **script.js** - Game logic and functionality
- **quiz_data.js** - Quiz questions and answers

## Customizing Questions

To add or modify quiz questions, edit `quiz_data.js`:

```javascript
{
    question: "Your question here?",
    options: ["Option 1", "Option 2", "Option 3", "Option 4"],
    correct: 0  // Index of correct answer (0-3)
}
```

## Scoring

- Each correct answer adds 1 point to your score
- The final score includes performance-based feedback messages:
  - 100% = Perfect score
  - 80%+ = Excellent
  - 60%+ = Good effort
  - 40%+ = Not bad
  - Below 40% = Keep learning

## Browser Compatibility

Works in all modern browsers:
- Chrome
- Firefox
- Safari
- Edge

Enjoy the quiz! 🎯
