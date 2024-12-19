import { agentDataSchema } from "@/client/contract";
import { formatRelative } from "date-fns";
import { startCase } from "lodash";
import {
  AlertTriangle,
  Brain,
  CheckCircleIcon,
  MessageCircle,
  MessageCircleReply,
  Speaker,
  Speech,
} from "lucide-react";
import { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { z } from "zod";
import { JSONDisplay } from "../JSONDisplay";
import { MessageContainerProps } from "./workflow-event";

interface DataSectionProps {
  title: string;
  icon: React.ComponentType<any>;
  content: ReactNode;
}

const DataSection = ({ title, icon: Icon, content }: DataSectionProps) => (
  <div className="mb-4 last:mb-0">
    <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-2">
      <Icon size={16} className="text-primary/70" />
      <span className="text-sm">{title}</span>
    </div>
    <div className="ml-6">{content}</div>
  </div>
);

const basicResultSchema = z.record(z.string());

const ResultSection = ({ result }: { result: object }) => {
  const { success: basic, data: basicData } =
    basicResultSchema.safeParse(result);

  if (basic) {
    return (
      <div className="space-y-4">
        {Object.entries(basicData).map(([key, value]) => (
          <div key={key}>
            <div className="text-sm font-medium text-muted-foreground/80 mb-2">
              {startCase(key)}
            </div>
            <div className="bg-muted rounded-md p-3 shadow-sm">
              {value.split("\n").map((v, index) => (
                <p key={index} className="text-sm leading-relaxed">
                  {v}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return <JSONDisplay json={result} />;
};

export const AiMessage = ({ data, createdAt }: MessageContainerProps) => {
  const parsedData = agentDataSchema.parse(data);
  const { issue, result, message, invocations, learnings } = parsedData;

  const hasReasoning = invocations?.find((invocation) => invocation.reasoning);
  if (!hasReasoning && !message && !result && !issue && !learnings) {
    return null;
  }

  return (
    <div className="mx-4">
      <div className="rounded-xl bg-secondary/30 p-4 shadow-sm border border-border/50 backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/50">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Brain size={18} className="text-primary" />
          </div>
          <div>
            <div className="text-sm font-medium">Inferable</div>
            <div className="text-xs text-muted-foreground">
              {formatRelative(createdAt, new Date())}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {message && (
            <DataSection
              title="Message"
              icon={MessageCircleReply}
              content={
                <ReactMarkdown className="text-sm text-muted-foreground prose-sm prose-p:leading-relaxed prose-p:my-1.5 prose-pre:bg-muted prose-pre:p-3 prose-pre:rounded-md">
                  {message}
                </ReactMarkdown>
              }
            />
          )}
          {result && <ResultSection result={result} />}
          {issue && (
            <DataSection
              title="Issue"
              icon={AlertTriangle}
              content={
                <p className="text-sm text-red-500/80 bg-red-500/5 rounded-md p-3">
                  {issue}
                </p>
              }
            />
          )}
          {hasReasoning &&
            invocations?.map((invocation, index) => (
              <DataSection
                key={index}
                title="Reasoning"
                icon={Brain}
                content={
                  <div className="">
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">
                        Invoking {invocation.toolName}:
                      </span>{" "}
                      {invocation.reasoning}
                    </p>
                  </div>
                }
              />
            ))}
          {learnings?.map((learning, index) => (
            <DataSection
              key={index}
              title="Learning"
              icon={Brain}
              content={
                <div className="bg-primary/5 rounded-md p-3">
                  <p className="text-sm text-muted-foreground">
                    {learning.summary}
                    <span className="text-xs ml-2 text-muted-foreground/70">
                      ({learning.entities.map((e: any) => e.name).join(", ")})
                    </span>
                  </p>
                </div>
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
};
