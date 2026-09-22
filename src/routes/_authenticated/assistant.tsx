import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, Boxes, LineChart, TriangleAlert, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-helpers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useActiveTenantId } from "@/lib/tenant";
import { useBranchContext } from "@/lib/branches";
import { askBusinessAssistant } from "@/lib/assistant.functions";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({
    meta: [
      { title: "Ask your shop assistant | Softtrack Pos" },
      {
        name: "description",
        content:
          "Ask plain-language questions about your branch stock, sales and expenses and get practical answers.",
      },
      { property: "og:title", content: "Ask your shop assistant | Softtrack Pos" },
      {
        property: "og:description",
        content: "Plain-language answers about your branch stock, sales and expenses.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssistantPage,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">{error.message}</div>,
});

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  { icon: TriangleAlert, text: "What am I about to run out of?" },
  { icon: LineChart, text: "How did sales go this week compared to last week?" },
  { icon: Boxes, text: "Which products should I restock first and why?" },
  { icon: Wallet, text: "Am I making money this month?" },
];

function AssistantPage() {
  const tenantId = useActiveTenantId();
  const { activeBranch, filterBranchId, locked } = useBranchContext();
  const ask = useServerFn(askBusinessAssistant);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const focusInput = () => textareaRef.current?.focus();
  useEffect(() => {
    focusInput();
  }, []);

  const mutation = useMutation({
    mutationFn: async (question: string) => {
      if (!tenantId) throw new Error("No business selected yet.");
      const res = await ask({
        data: {
          tenantId,
          branchId: filterBranchId ?? null,
          question,
          history: turns.slice(-6),
        },
      });
      return res.answer;
    },
    onSuccess: (answer) => {
      setTurns((t) => [...t, { role: "assistant", content: answer }]);
      focusInput();
    },
    onError: (error: Error) => {
      toast.error(error.message || "The assistant could not answer just now. Please try again.");
      focusInput();
    },
  });

  const send = (question: string) => {
    const q = question.trim();
    if (!q || mutation.isPending) return;
    setTurns((t) => [...t, { role: "user", content: q }]);
    setInput("");
    mutation.mutate(q);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        title="Ask your shop assistant"
        description="Questions about your stock, sales and expenses — answered in plain language."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="gap-1">
          <Bot className="h-3.5 w-3.5" />
          {activeBranch ? activeBranch.name : "All branches"}
        </Badge>
        {locked && <span className="text-xs text-muted-foreground">Answers cover your branch only.</span>}
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Conversation className="min-h-[320px] flex-1">
          <ConversationContent className="gap-4">
            {turns.length === 0 && !mutation.isPending && (
              <div className="mx-auto max-w-lg space-y-4 py-8 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl gradient-emerald text-white shadow-soft">
                  <Bot className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-base font-semibold">Ask about your counter</p>
                  <p className="text-sm text-muted-foreground">
                    Stock levels, best sellers, slow movers, money in and out.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <Button
                      key={s.text}
                      variant="outline"
                      className="h-auto justify-start whitespace-normal py-2 text-left text-sm"
                      onClick={() => send(s.text)}
                    >
                      <s.icon className="h-4 w-4 shrink-0" />
                      <span>{s.text}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((t, i) => (
              <Message key={i} from={t.role}>
                {t.role === "assistant" ? (
                  <MessageResponse>{t.content}</MessageResponse>
                ) : (
                  <MessageContent>{t.content}</MessageContent>
                )}
              </Message>
            ))}

            {mutation.isPending && (
              <Message from="assistant">
                <Shimmer>Checking your figures…</Shimmer>
              </Message>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t p-3">
          <PromptInput
            onSubmit={(_message, event) => {
              event.preventDefault();
              send(input);
            }}
          >
            <PromptInputTextarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. Which items are almost finished?"
            />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit
                status={mutation.isPending ? "submitted" : undefined}
                disabled={!input.trim() || mutation.isPending}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </Card>
    </div>
  );
}
