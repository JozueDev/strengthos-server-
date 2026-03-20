import os
import google.genai as genai
from dotenv import load_dotenv

load_dotenv()
api_key = os.environ.get("GEMINI_API_KEY")
print(f"Testing key: {api_key[:10]}...")

try:
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model="gemini-flash-latest",
        contents="Hello, say 'Key Working'"
    )
    print(response.text)
except Exception as e:
    print(f"ERROR: {e}")
