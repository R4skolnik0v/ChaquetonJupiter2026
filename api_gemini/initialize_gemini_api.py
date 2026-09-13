import os
from google import genai

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise RuntimeError("Falta GEMINI_API_KEY. Configurarlo antes de ejecutar este script.")

client = genai.Client(api_key=api_key)
response = client.models.generate_content(
    model="gemini-3.5-flash-lite",
    contents="Responde solo con OK",
)
print(response.text.strip())