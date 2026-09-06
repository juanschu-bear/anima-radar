from pathlib import Path


PROMPT_ROOT = Path(__file__).resolve().parents[2] / "prompts"


def load_prompt(name: str) -> str:
    path = (PROMPT_ROOT / name).resolve()
    if path.parent != PROMPT_ROOT.resolve() or path.suffix != ".md":
        raise ValueError("Prompt name must be a markdown file in the prompts directory")
    return path.read_text(encoding="utf-8")
