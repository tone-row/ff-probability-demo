import { CytoscapeOptions } from "cytoscape";

export function parseText(text: string, startingLineNumber = 0) {
  const elements: CytoscapeOptions["elements"] = [];
  let lineNumber = 1;

  // break into lines
  const lineText = text.split("\n");

  // Loop over lines
  for (const line of lineText) {
    if (line.trim() === "") {
      lineNumber++;
      continue;
    }
    const { linkedId, nodeLabel, edgeLabel, indent, id } = getLineData(
      line,
      lineNumber
    );

    let count: number | null = null;

    if (indent) {
      let parentLine;
      let checkLine = lineNumber;

      while (checkLine >= 1) {
        checkLine -= 1;
        const currentLine = lineText[checkLine - 1];

        /* Determine whether valid line */
        if (currentLine.trim() === "") {
          continue;
        }

        const { indent: currentLineIndent } = getLineData(
          currentLine,
          checkLine
        );
        if (currentLineIndent.length < indent.length) {
          parentLine = checkLine;
          break;
        }
      }

      // If we found a parent
      if (parentLine) {
        const { id: source } = getLineData(lineText[checkLine - 1], parentLine);
        const target = linkedId || getLineData(line, lineNumber).id;

        // Find a unique id
        let id = `${source}_${target}:0`;
        while (elements.map(({ data: { id } }) => id).includes(id)) {
          let [, count] = id.split(":");
          count = (parseInt(count, 10) + 1).toString();
          id = `${source}_${target}:${count}`;
        }

        // Set current count
        let parentCount =
          (elements.find((e) => e.data.id === source)?.data.count as number) ??
          1;
        count = parseFloat(edgeLabel) * parentCount;

        elements.push({
          data: {
            id,
            source,
            target,
            label: edgeLabel,
            lineNumber: lineNumber + startingLineNumber,
          },
        });
      }
    }

    // determine parent

    if (!linkedId) {
      let label = nodeLabel,
        prob = "";
      if (count) {
        prob = `${(100 * count).toFixed(2)}%`;
      }

      // Check for custom id
      elements.push({
        data: {
          id,
          indent,
          count,
          label,
          prob,
          lineNumber: lineNumber + startingLineNumber,
          ...getSize(nodeLabel),
        },
      });
    }
    lineNumber++;
  }

  // Before returning elements, check if user
  // used label text as pointer, and replace with id
  const labelToId = elements.reduce<Record<string, string>>(
    (acc, el) => ({
      ...acc,
      [el.data.label]: el.data.id,
    }),
    {}
  );

  for (const [index, element] of Object.entries(elements)) {
    // If it is an edge
    if ("target" in element.data) {
      if (!Object.values(labelToId).includes(element.data.target)) {
        if (element.data.target in labelToId) {
          elements[parseInt(index, 10)].data.target =
            labelToId[element.data.target];
        }
      }
    }
  }

  return elements;
}

function getLineData(text: string, lineNumber: number) {
  // Whole line description in one regex with named capture groups
  // 1) Indent ^(?<indent>\s*) -- store the indent which is 0 or more whitespace at the start
  // 2) ID (\[(?<id>.*)\])? -- store the ID if it exists after the indent in square brackets
  // 3) Edge Label ((?<edgeLabel>.+): )? -- store the edge label if it exists
  // 4) Node Label (?<nodeLabel>.+?) -- store the node label
  const lineRegex =
    /^(?<indent>\s*)(\[(?<id>.*)\])?((?<edgeLabel>.+)[:：] *)?(?<nodeLabel>.+?)$/;
  const { groups } = text.match(lineRegex) || {};
  const {
    nodeLabel = "",
    edgeLabel = "",
    indent,
    id = lineNumber.toString(),
  } = groups || {};
  const { groups: labelGroups } =
    nodeLabel.match(/^[(（](?<linkedId>.+)[)）]\s*$/) || {};
  const { linkedId } = labelGroups || {};

  return {
    nodeLabel: decodeURIComponent(nodeLabel.trim()),
    edgeLabel: decodeURIComponent(edgeLabel.trim()),
    indent,
    id,
    linkedId:
      typeof linkedId !== "undefined" ? decodeURIComponent(linkedId) : linkedId,
  };
}

const base = 12.5;
const minWidth = 8 * base;
const minHeight = 6 * base;

function getSize(label: string) {
  const resizer = document.getElementById("resizer");
  if (resizer) {
    // TODO: Widen boxes as box height climbs
    // resizer.style.width = "128px";
    // const initialHeight = resizer.clientHeight;
    // const add = Math.max(0, Math.ceil((initialHeight - 150) / 50)) * 8;
    // resizer.style.width = `${128 + add}px`;
    resizer.innerHTML = preventCyRenderingBugs(label);
    if (resizer.firstChild) {
      const range = document.createRange();
      range.selectNodeContents(resizer.firstChild);
      const width = Array.from(range.getClientRects()).reduce(
        (max, { width }) => (width > max ? width : max),
        0
      );
      const finalSize = {
        width: Math.max(minWidth, cleanup(regressionX(width))),
        height: Math.max(minHeight, cleanup(regressionY(resizer.clientHeight))),
      };
      return finalSize;
    }
  }
  return undefined;
}

// linear regression of text node width to graph node size
function regressionX(x: number) {
  return Math.floor(0.63567 * x + 6);
}
function regressionY(x: number) {
  return Math.floor(0.63567 * x + 20);
}

// put things roughly on the same scale
function cleanup(x: number) {
  return Math.ceil(x / base) * base;
}

function preventCyRenderingBugs(str: string) {
  return (
    str
      // prevent break on hypen
      .replace(/-/gm, "&#x2011;")
      // prevent break on chinese comma
      .replace(/，/gm, "&#x2011;")
  );
}
