/* eslint-disable @typescript-eslint/no-explicit-any */
import { client } from "@/client/client";
import "./instructions-editor.css";

import Document from "@tiptap/extension-document";
import Mention, { MentionOptions } from "@tiptap/extension-mention";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { EditorContent, ReactRenderer, useEditor } from "@tiptap/react";
import { ClientInferResponseBody } from "@ts-rest/core";
import React, {
  KeyboardEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
  useMemo,
} from "react";
import tippy from "tippy.js";
import { contract } from "@/client/contract";
import { useAuth } from "@clerk/nextjs";
import { cn, createErrorToast } from "@/lib/utils";
import Bold from "@tiptap/extension-bold";
import BulletList from "@tiptap/extension-bullet-list";
import ListItem from "@tiptap/extension-list-item";
import { Button } from "./ui/button";
import { BoldIcon, ListIcon } from "lucide-react";
import { useClusterState } from "./useClusterState";

type ServiceFunction = {
  service: string;
  function: string;
  description: string;
};

interface MentionListProps {
  items: ServiceFunction[];
  command: (props: { id: string }) => void;
}

interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const MentionList = React.forwardRef<MentionListRef, MentionListProps>(
  function MentionList(props, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
      const item = props.items[index];

      if (item) {
        props.command({ id: `${item.service}.${item.function}` });
      }
    };

    const upHandler = () => {
      setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
    };

    const downHandler = () => {
      setSelectedIndex((selectedIndex + 1) % props.items.length);
    };

    const enterHandler = () => {
      selectItem(selectedIndex);
    };

    useEffect(() => setSelectedIndex(0), [props.items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "ArrowUp") {
          upHandler();
          return true;
        }

        if (event.key === "ArrowDown") {
          downHandler();
          return true;
        }

        if (event.key === "Enter") {
          enterHandler();
          return true;
        }

        return false;
      },
    }));

    return (
      <div className="dropdown-menu">
        {props.items.length ? (
          props.items.map((item, index) => (
            <button
              className={cn(
                index === selectedIndex ? "is-selected" : "",
                "flex flex-col justify-start items-start mb-2"
              )}
              key={index}
              onClick={() => selectItem(index)}
            >
              <p className="text-sm font-medium">
                {item.service}.{item.function}
              </p>
              <p className="text-xs text-gray-500">{item.description}</p>
            </button>
          ))
        ) : (
          <div className="item">No result</div>
        )}
      </div>
    );
  }
);

const suggestion = (
  services: Array<{ service: string; function: string; description: string }>
): MentionOptions["suggestion"] => ({
  items: ({ query }: { query: string }) => {
    return (
      services
        ?.filter(
          item =>
            `${item.service}.${item.function}`.toLowerCase().includes(query.toLowerCase()) ||
            item.description.toLowerCase().includes(query.toLowerCase())
        )
        ?.slice(0, 10) || []
    );
  },

  render: () => {
    let component: any;
    let popup: any;

    return {
      onStart: props => {
        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) {
          return;
        }

        popup = tippy("body", {
          getReferenceClientRect: props.clientRect as any,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
        });
      },

      onUpdate(props: any) {
        component.updateProps(props);

        if (!props.clientRect) {
          return;
        }

        popup[0].setProps({
          getReferenceClientRect: props.clientRect,
        });
      },

      onKeyDown(props: any) {
        if (props.event.key === "Escape") {
          popup[0].hide();

          return true;
        }

        return component.ref?.onKeyDown(props);
      },

      onExit() {
        popup[0].destroy();
        component.destroy();
      },
    };
  },
});

const TipTap = ({
  value,
  onChange,
  services,
}: {
  value: string;
  onChange: (value: string) => void;
  services: ServiceFunction[];
}) => {
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === "Tab") {
      event.preventDefault();
    }
  }, []);

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Bold, // Add Bold extension
      BulletList, // Add BulletList extension
      ListItem, // Add ListItem extension
      Mention.configure({
        HTMLAttributes: {
          class: "mention",
        },
        suggestion: suggestion(services),
      }),
    ],
    onUpdate: ({ editor }) => {
      const text = editor.getHTML();
      onChange(text);
    },
    editorProps: {
      handleKeyDown: (view, event) => {
        if (event.key === "Tab") {
          event.preventDefault();
          view.dispatch(view.state.tr.insertText("\t"));
          return true;
        }
        return false;
      },
    },
  });

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && editor && !editor.getText()) {
      editor.commands.setContent(value);
    }
  }, [editor, isMounted, value]);

  if (!editor) return null;

  return (
    <div className="rich-text-editor" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
      <div className="menu-bar">
        <Button
          onClick={e => {
            editor?.chain().focus().toggleBold().run();
          }}
          className={cn(editor?.isActive("bold") ? "is-active" : "")}
          type="button"
          variant="ghost"
          size="sm"
        >
          <BoldIcon className="h-4 w-4" />
        </Button>
        <Button
          onClick={e => {
            editor?.chain().focus().toggleBulletList().run();
          }}
          className={cn(editor?.isActive("bulletList") ? "is-active" : "")}
          type="button"
          variant="ghost"
          size="sm"
        >
          <ListIcon className="h-4 w-4" />
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
};

export const InstructionsEditor = ({
  value,
  onChange,
  clusterId,
  keyProp,
}: {
  value: string;
  onChange: (value: string) => void;
  clusterId: string;
  keyProp: string | null;
}) => {
  const { services } = useClusterState(clusterId);
  const serviceFunctions = useMemo(
    () =>
      services.flatMap(service =>
        (service.functions || []).map(fn => ({
          service: service.name,
          function: fn.name,
          description: fn.description || "",
        }))
      ),
    [services]
  );

  return (
    <div className="relative">
      <TipTap value={value} onChange={onChange} services={serviceFunctions} />
    </div>
  );
};
