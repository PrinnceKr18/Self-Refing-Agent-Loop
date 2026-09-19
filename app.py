import os
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from backend import run_with_history

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(
    title="Agentic Loop - Self-Refining AI Writer",
    description="Multi-agent iterative authoring with LangGraph & Groq",
    version="1.0.0"
)

# Mount static files and templates
static_dir = BASE_DIR / "static"
template_dir = BASE_DIR / "template"

os.makedirs(static_dir, exist_ok=True)
os.makedirs(template_dir, exist_ok=True)

app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
templates = Jinja2Templates(directory=str(template_dir))


class TopicRequest(BaseModel):
    topic: str = Field(..., min_length=2, max_length=200, description="The topic to explain")


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """Renders the main agent loop interface."""
    return templates.TemplateResponse(request=request, name="index.html")


@app.post("/api/generate")
async def generate_explanation(req: TopicRequest):
    """Executes the LangGraph iterative multi-agent loop."""
    try:
        topic = req.topic.strip()
        if not topic:
            raise HTTPException(status_code=400, detail="Topic cannot be empty")
        
        result = run_with_history(topic)
        return {
            "success": True,
            "topic": topic,
            "final_state": result["final_state"],
            "steps": result["steps"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
