// Call this function after a game, quiz, or upload to save the session to the notebook
function saveNotebookEntry({
  title,        // e.g. 'Quiz: Photosynthesis', 'Uploaded: Chapter 2 Notes'
  fileName,     // e.g. 'chapter2.pdf' or null
  gameType,     // e.g. 'Quiz', 'Flashcards', 'Slide Game'
  results,      // e.g. 'Score: 8/10', 'Completed in 5:32'
  corrections,  // e.g. 'Q3: Incorrect, see explanation...'
  notes,        // Any extra notes or summary
  content       // Optional summary or main content
}) {
  const entry = {
    title: title || 'Untitled Entry',
    fileName: fileName || '',
    gameType: gameType || '',
    results: results || '',
    corrections: corrections || '',
    notes: notes || '',
    content: content || '',
    date: new Date().toISOString()
  };
  let notebook = [];
  try {
    notebook = JSON.parse(localStorage.getItem('sp_notebook') || '[]');
  } catch (e) {}
  notebook.push(entry);
  localStorage.setItem('sp_notebook', JSON.stringify(notebook));
}

// Example usage:
// saveNotebookEntry({
//   title: 'Quiz: Algebra Basics',
//   fileName: 'algebra.pdf',
//   gameType: 'Quiz',
//   results: 'Score: 7/10',
//   corrections: 'Q2: Incorrect, see solution.',
//   notes: 'Need to review factoring.',
//   content: 'Completed quiz on algebra basics.'
// });
