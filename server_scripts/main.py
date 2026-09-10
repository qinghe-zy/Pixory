from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import fcntl
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

COUNTER_FILE = "counter.txt"

def get_next_id():
    # Ensure file exists
    if not os.path.exists(COUNTER_FILE):
        with open(COUNTER_FILE, 'w') as f:
            f.write("0")
            
    with open(COUNTER_FILE, 'r+') as f:
        # Lock file for thread safety
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            content = f.read().strip()
            counter = int(content) if content else 0
            counter += 1
            
            # Format to AAA-001
            num = counter % 1000
            alpha_val = counter // 1000
            
            c3 = chr(65 + (alpha_val % 26))
            alpha_val //= 26
            c2 = chr(65 + (alpha_val % 26))
            alpha_val //= 26
            c1 = chr(65 + (alpha_val % 26))
            
            new_id = f"{c1}{c2}{c3}-{num:03d}"
            
            # Write back
            f.seek(0)
            f.truncate()
            f.write(str(counter))
            
            return new_id
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)

@app.get("/api/get_id")
def generate_id():
    new_id = get_next_id()
    return {"success": True, "id": new_id}
