
import json
from pathlib import Path

data_dir = Path("data")
list_file = data_dir / "_list.json"
output_file = data_dir / "_list-summary.json"

paths = json.loads(list_file.read_text(encoding="utf-8"))
summaries = []

for path in paths:
    level_file = data_dir / f"{path}.json"

    try:
        level = json.loads(level_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"Skipping {level_file}: {error}")
        continue

    summaries.append({
        "path": path,
        "id": level.get("id"),
        "name": level.get("name", ""),
    })

output_file.write_text(
    json.dumps(summaries, ensure_ascii=False, separators=(",", ":")),
    encoding="utf-8",
)

print(f"Generated {output_file} with {len(summaries)} levels.")
