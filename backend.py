import os
from pathlib import Path
import sys
from typing import Literal, TypedDict

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

# Load environment variables from local folder or parent directory
load_dotenv()
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
MAX_REVISIONS = int(os.getenv("MAX_REVISIONS", 2))

model = ChatGroq(
    model=MODEL,
    temperature=0.0,
    api_key=os.getenv("GROQ_API_KEY")
)

class Reviewer(BaseModel):
    decision: Literal["PASS", "REVISE"] = Field(
        description="PASS only if the answer satisfy every review rule; otherwise REVISE"
    )
    feedback: str = Field(
        description="short, specific feedback. Empty string when decision is PASS."
    )

reviewer_model = model.with_structured_output(Reviewer)

class State(TypedDict):
    topic: str
    draft: str
    feedback: str
    decision: str
    revision_count: int


def writer(state: State):
    """Agent 1: create the first answer."""
    response = model.invoke(
        [
            {
                "role": "system",
                "content": (
                    "you are a beginner-friendly teacher. Explain the topic in 120-160 words. "
                    "Use simple language, one everyday analogy, and one tiny example."
                ),
            },
            {
                "role": "user",
                "content": f"Explain {state['topic']}",
            },
        ]
    )

    return {
        "draft": response.content,
        "revision_count": 0,
        "feedback": "",
        "decision": "",
    }


def reviewer(state: State):
    """Agent 2: evaluate the current answer."""
    review = reviewer_model.invoke(
        [
            {
                "role": "system",
                "content": (
                    "you are a strict reviewer. Check the answer using only these rules:\n"
                    "1. It is easy for a beginner.\n"
                    "2. It contains an everyday analogy.\n"
                    "3. It contains a tiny concrete example.\n"
                    "4. It stays focused on the requested topic.\n"
                    "If any rule fails, choose REVISE and give one or two precise improvements."
                ),
            },
            {
                "role": "user",
                "content": f"Topic: {state['topic']}\n\nAnswer: {state['draft']}",
            },
        ]
    )

    return {
        "decision": review.decision,
        "feedback": review.feedback,
    }


def reviser(state: State):
    """Agent 3: revise the answer based on reviewer feedback."""
    response = model.invoke(
        [
            {
                "role": "system",
                "content": (
                    "You are a helpful teacher. Your task is to revise and improve the explanation "
                    "strictly addressing the reviewer's feedback while keeping it beginner-friendly, "
                    "with one everyday analogy and one tiny example."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Topic: {state['topic']}\n\n"
                    f"Current Answer:\n{state['draft']}\n\n"
                    f"Reviewer Feedback:\n{state['feedback']}\n\n"
                    "Please rewrite and improve the answer addressing the feedback."
                ),
            },
        ]
    )

    return {
        "draft": response.content,
        "revision_count": state["revision_count"] + 1,
    }


def should_continue(state: State) -> Literal["reviser", END]:
    """Router: decide whether to revise again or finish."""
    if state["decision"] == "PASS" or state["revision_count"] >= MAX_REVISIONS:
        return END
    return "reviser"


# Graph Definition
builder = StateGraph(State)
builder.add_node("writer", writer)
builder.add_node("reviewer", reviewer)
builder.add_node("reviser", reviser)

builder.add_edge(START, "writer")
builder.add_edge("writer", "reviewer")
builder.add_conditional_edges("reviewer", should_continue)
builder.add_edge("reviser", "reviewer")

graph = builder.compile()


def run(topic: str) -> State:
    """Invokes the agent graph for a given topic and returns the final state."""
    return graph.invoke({
        "topic": topic,
        "draft": "",
        "feedback": "",
        "decision": "",
        "revision_count": 0,
    })


def run_with_history(topic: str):
    """Runs the agent workflow while capturing step-by-step execution history."""
    initial_state: State = {
        "topic": topic,
        "draft": "",
        "feedback": "",
        "decision": "",
        "revision_count": 0,
    }
    steps = []
    current_state = dict(initial_state)
    for event in graph.stream(initial_state):
        for node_name, node_output in event.items():
            current_state.update(node_output)
            steps.append({
                "node": node_name,
                "output": node_output,
                "state": dict(current_state),
            })
    return {
        "final_state": current_state,
        "steps": steps,
    }


if __name__ == "__main__":
    test_topic = "Photosynthesis"
    print(f"Starting agent loop for topic: '{test_topic}'...\n")
    result = run(test_topic)
    print("=" * 40)
    print("FINAL RESULT:")
    print("=" * 40)
    print(f"Draft:\n{result['draft']}\n")
    print(f"Total Revisions: {result['revision_count']}")
    print(f"Decision: {result['decision']}")
    if result["feedback"]:
        print(f"Feedback: {result['feedback']}")
