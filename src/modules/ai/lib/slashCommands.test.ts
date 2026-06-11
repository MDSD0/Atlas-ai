import { beforeEach, describe, expect, it } from "vitest";
import { usePlanStore } from "../store/planStore";
import { tryRunSlashCommand } from "./slashCommands";

describe("slash commands", () => {
  beforeEach(() => {
    usePlanStore.setState({ active: false, queue: [], sessions: {} });
  });

  it("#plan toggles only the active chat session", () => {
    expect(tryRunSlashCommand("#plan", "chat-a")).toMatchObject({
      kind: "handled",
    });

    const store = usePlanStore.getState();
    expect(store.isActive("chat-a")).toBe(true);
    expect(store.isActive("chat-b")).toBe(false);
    expect(store.active).toBe(false);
  });

  it("#plan with a task enables plan mode and sends the task", () => {
    expect(tryRunSlashCommand("#plan build the calculator", "chat-a")).toEqual({
      kind: "send-prompt",
      prompt: "build the calculator",
      commandName: "plan",
    });
    expect(usePlanStore.getState().isActive("chat-a")).toBe(true);
  });

  it("atlas shortcut commands rewrite into normal prompts", () => {
    expect(tryRunSlashCommand("#test", "chat-a")).toMatchObject({
      kind: "send-prompt",
      commandName: "test",
    });
    expect(tryRunSlashCommand("#review check the stop button", "chat-a")).toEqual({
      kind: "send-prompt",
      commandName: "review",
      prompt: "check the stop button",
    });
  });
});
