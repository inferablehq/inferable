"use client";

import { client } from "@/client/client";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn, createErrorToast } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { MessageCircle, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

// Import the CSS file for the animation
import "@/styles/button-animations.css";

export function FeedbackDialog({
  runId,
  clusterId,
  comment: existingComment,
  score: existingScore,
}: {
  runId: string;
  clusterId: string;
  comment?: string | null;
  score?: number | null;
}) {
  const [feedbackComment, setFeedbackComment] = useState(existingComment || "");
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const { getToken } = useAuth();
  const [thumbsUpClicked, setThumbsUpClicked] = useState(existingScore === 1);
  const [thumbsDownClicked, setThumbsDownClicked] = useState(
    existingScore === 0,
  );
  const [selectedScore, setSelectedScore] = useState<number | null>(
    existingScore ?? null,
  );
  const [animateGood, setAnimateGood] = useState(false);
  const [animateBad, setAnimateBad] = useState(false);

  const handleSubmitFeedback = useCallback(
    async (score: number, comment?: string) => {
      try {
        const feedbackResult = await client.createFeedback({
          body: {
            comment: comment || null,
            score,
          },
          headers: {
            authorization: `Bearer ${await getToken()}`,
          },
          params: {
            clusterId: clusterId,
            runId,
          },
        });

        if (feedbackResult?.status !== 204) {
          createErrorToast(feedbackResult, "Failed to submit feedback");
        } else {
          toast.success("Thank you for your feedback!");
        }
      } catch (error) {
        console.error(error);
        toast.error("Failed to submit feedback");
      } finally {
        setIsFeedbackOpen(false);
        setFeedbackComment("");
      }
    },
    [clusterId, runId, getToken],
  );

  const handleGoodResult = useCallback(async () => {
    setThumbsUpClicked(true);
    setThumbsDownClicked(false);
    setSelectedScore(1);
    setAnimateGood(true);
    await handleSubmitFeedback(1);
  }, [handleSubmitFeedback]);

  const handleBadResult = useCallback(async () => {
    setThumbsDownClicked(true);
    setThumbsUpClicked(false);
    setSelectedScore(0);
    setAnimateBad(true);
    await handleSubmitFeedback(0);
  }, [handleSubmitFeedback]);

  useEffect(() => {
    if (animateGood) {
      const timer = setTimeout(() => setAnimateGood(false), 1500); // 1.5 seconds animation
      return () => clearTimeout(timer);
    }
  }, [animateGood]);

  useEffect(() => {
    if (animateBad) {
      const timer = setTimeout(() => setAnimateBad(false), 1500); // 1.5 seconds animation
      return () => clearTimeout(timer);
    }
  }, [animateBad]);

  const handleCommentSubmit = useCallback(() => {
    if (selectedScore !== null) {
      handleSubmitFeedback(selectedScore, feedbackComment);
    }
  }, [selectedScore, feedbackComment, handleSubmitFeedback]);

  return (
    <div className="flex items-center space-x-2">
      <Button
        size="sm"
        variant="outline"
        className={cn("gap-2", {
          "bg-green-100": thumbsUpClicked && !animateGood,
          "animate-good-result": animateGood,
        })}
        onClick={handleGoodResult}
      >
        <ThumbsUpIcon
          className={cn("h-4 w-4", { "text-green-500": thumbsUpClicked })}
        />
        {thumbsUpClicked ? "Good Result" : ""}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={cn("gap-2", {
          "bg-red-100": thumbsDownClicked && !animateBad,
          "animate-bad-result": animateBad,
        })}
        onClick={handleBadResult}
      >
        <ThumbsDownIcon
          className={cn("h-4 w-4", { "text-red-500": thumbsDownClicked })}
        />
        {thumbsDownClicked ? "Bad Result" : ""}
      </Button>
      {(thumbsUpClicked || thumbsDownClicked) && (
        <Popover open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="gap-2">
              <MessageCircle className="h-4 w-4" />
              {existingComment ? "Edit Comment" : "Add Comment"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px]">
            <div className="space-y-4">
              <h3 className="font-semibold">
                {existingComment ? "Edit Comment" : "Add Comment"}
              </h3>
              <p className="text-sm text-muted-foreground">
                Your feedback will help us improve our workflows. We appreciate
                your input!
              </p>
              <Textarea
                placeholder="Your comment..."
                value={feedbackComment}
                rows={4}
                onChange={(e) => setFeedbackComment(e.target.value)}
                className="resize-none"
              />
              <Button onClick={handleCommentSubmit}>
                {existingComment ? "Update Comment" : "Submit Comment"}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
