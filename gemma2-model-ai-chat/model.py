import os

from google import genai


def main():
    api_key = os.getenv("GOOGLE_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Set GOOGLE_API_KEY before running this script.")

    client = genai.Client(api_key=api_key)
    model = "gemini-2.5-flash"
    prompt = "Explain active recall in simple terms for high school students."

    response = client.models.generate_content(model=model, contents=prompt)
    print(response.text)


if __name__ == "__main__":
    main()
