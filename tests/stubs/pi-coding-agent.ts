import { Container, Text } from "./pi-tui.ts";

export class UserMessageComponent extends Container {
  constructor(text: string) {
    super();
    this.addChild(new Text(`user: ${text}`, 0, 0));
  }
}

export class AssistantMessageComponent extends Container {
  constructor(message?: any, hideThinkingBlock = false) {
    super();
    const text = Array.isArray(message?.content)
      ? message.content
          .filter((block: any) => !(hideThinkingBlock && block.type === "thinking"))
          .map(
            (block: any) => block.text ?? block.thinking ?? `[${block.type}] ${block.name ?? ""}`,
          )
          .join(" ")
      : "";
    this.addChild(new Text(`assistant: ${text}`, 0, 0));
  }
}

export class ToolExecutionComponent extends Container {
  private result: any;
  constructor(
    private toolName: string,
    private _toolCallId: string,
    private args: any,
  ) {
    super();
  }
  markExecutionStarted() {}
  setArgsComplete() {}
  updateResult(result: any) {
    this.result = result;
  }
  setExpanded() {}
  render(width: number): string[] {
    const text = Array.isArray(this.result?.content)
      ? this.result.content.map((block: any) => block.text ?? "").join("\n")
      : "";
    return [
      `tool:${this.toolName} ${JSON.stringify(this.args)}`,
      ...new Text(text, 0, 0).render(width),
    ];
  }
}

export class BranchSummaryMessageComponent extends Container {
  constructor(message: any) {
    super();
    this.addChild(new Text(`branch: ${message.summary ?? ""}`, 0, 0));
  }
}

export class CompactionSummaryMessageComponent extends Container {
  constructor(message: any) {
    super();
    this.addChild(new Text(`compaction: ${message.summary ?? ""}`, 0, 0));
  }
}
