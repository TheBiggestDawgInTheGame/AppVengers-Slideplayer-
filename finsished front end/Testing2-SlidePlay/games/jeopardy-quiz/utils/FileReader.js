class FileReaderUtil {
  static async readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        resolve(event.target.result);
      };

      reader.onerror = (error) => {
        reject(error);
      };

      reader.readAsText(file);
    });
  }

  static async readMultipleFiles(files) {
    const fileContents = [];

    for (let file of files) {
      try {
        let content = "";
        if (
          file.type.includes("text") ||
          file.name.endsWith(".txt") ||
          file.name.endsWith(".md")
        ) {
          content = await this.readTextFile(file);
        } else {
          // For other file types, we'd need additional libraries like PDF.js
          content = `Content from ${file.name} - This would be parsed in a full implementation.`;
        }
        fileContents.push({
          name: file.name,
          content: content,
          type: file.type,
        });
      } catch (error) {
        console.error(`Error reading file ${file.name}:`, error);
      }
    }

    return fileContents;
  }
}

window.FileReaderUtil = FileReaderUtil;
