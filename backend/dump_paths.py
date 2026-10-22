import json
from app.main import app

# Generate the OpenAPI schema
schema = app.openapi()

# Print all paths to a file for easy reading
with open("registered_paths.json", "w") as f:
    json.dump(list(schema["paths"].keys()), f, indent=2)

print("Registered paths saved to registered_paths.json")
