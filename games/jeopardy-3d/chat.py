"""pip install streamlit langchain langchain-openai markitdown pydantic python-pptx python-docx
"""
import streamlit as st
from markitdown import MarkItDown
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field
from typing import List

# 1. Define the Quiz Structure
class Question(BaseModel):
    question: str = Field(description="The quiz question")
    options: List[str] = Field(description="List of 4 multiple-choice options")
    answer: str = Field(description="The correct option from the options list")
    explanation: str = Field(description="Brief explanation of the answer")

class Quiz(BaseModel):
    questions: List[Question]

# 2. Function to Extract Text
def extract_text(uploaded_file):
    md = MarkItDown()
    # MarkItDown handles pdf, docx, pptx, and txt natively
    result = md.convert(uploaded_file)
    return result.text_content

# 3. Function to Generate Quiz
def generate_quiz(text, num_questions=5):
    llm = ChatOpenAI(model="gpt-4o", temperature=0.7)
    parser = PydanticOutputParser(pydantic_object=Quiz)
    
    prompt = PromptTemplate(
        template="Analyze the following text and create a {num} question quiz.\n{format_instructions}\nText: {text}",
        input_variables=["num", "text"],
        partial_variables={"format_instructions": parser.get_format_instructions()},
    )
    
    chain = prompt | llm | parser
    return chain.invoke({"num": num_questions, "text": text[:15000]}) # Truncated for context limits

def main():
    st.title("📚 AI Quiz Generator Bot")
    st.sidebar.header("Upload Materials")
    
    uploaded_file = st.sidebar.file_uploader("Upload PPTX, PDF, DOCX, or TXT", type=["pdf", "pptx", "docx", "txt"])
    num_q = st.sidebar.slider("Number of questions", 1, 10, 5)

    if uploaded_file and st.sidebar.button("Generate Quiz"):
        with st.spinner("Analyzing content..."):
            text = extract_text(uploaded_file)
            st.session_state.quiz = generate_quiz(text, num_q)
            st.session_state.current_q = 0
            st.session_state.score = 0
            st.session_state.submitted = False

    # Display Quiz
    if "quiz" in st.session_state:
        q_idx = st.session_state.current_q
        quiz_data = st.session_state.quiz.questions
        
        if q_idx < len(quiz_data):
            q = quiz_data[q_idx]
            st.write(f"### Question {q_idx + 1}")
            st.write(q.question)
            
            # User Answer
            choice = st.radio("Choose one:", q.options, key=f"q_{q_idx}")
            
            if st.button("Submit Answer"):
                if choice == q.answer:
                    st.success(f"Correct! {q.explanation}")
                    st.session_state.score += 1
                else:
                    st.error(f"Wrong. The correct answer was: {q.answer}. {q.explanation}")
                
                st.session_state.submitted = True
            
            if st.session_state.get("submitted"):
                if st.button("Next Question"):
                    st.session_state.current_q += 1
                    st.session_state.submitted = False
                    st.rerun()
        else:
            st.balloons()
            st.write(f"## Quiz Finished! Your Score: {st.session_state.score}/{len(quiz_data)}")
            if st.button("Restart"):
                del st.session_state.quiz
                st.rerun()

if __name__ == "__main__":
    main()