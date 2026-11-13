"use client";

import { Card } from "@astryxdesign/core/Card";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { isShortFact, parsePostingText, type Block, type Item } from "@demo/lib/posting-text";

type Fact = Extract<Block, { kind: "field" }>;
type Group = { kind: "facts"; facts: Fact[] } | { kind: "notices"; texts: string[] } | { kind: "block"; block: Block };

/** Runs of short facts and of notices are drawn together: a key-value grid and one notice box. */
function group(blocks: Block[]): Group[] {
  return blocks.reduce<Group[]>((groups, block) => {
    const last = groups.at(-1);
    if (isShortFact(block))
      return last?.kind === "facts"
        ? [...groups.slice(0, -1), { kind: "facts", facts: [...last.facts, block] }]
        : [...groups, { kind: "facts", facts: [block] }];
    if (block.kind === "notice")
      return last?.kind === "notices"
        ? [...groups.slice(0, -1), { kind: "notices", texts: [...last.texts, block.text] }]
        : [...groups, { kind: "notices", texts: [block.text] }];
    return [...groups, { kind: "block", block }];
  }, []);
}

function ItemView({ item }: { item: Item }): React.ReactElement {
  switch (item.kind) {
    case "heading":
      return (
        <li className="pt-heading">
          <Text weight="semibold">{item.text}</Text>
        </li>
      );
    case "labeled":
      return (
        <li className="pt-labeled">
          <Text weight="semibold" hasTabularNumbers>
            {item.label}
          </Text>
          <Text>{item.text}</Text>
        </li>
      );
    case "bullet":
      return (
        <li className="pt-bullet" data-marker={item.marker ?? "•"}>
          <Text>{item.text}</Text>
        </li>
      );
    default:
      return (
        <li className="pt-text">
          <Text>{item.text}</Text>
        </li>
      );
  }
}

function Items({ items }: { items: Item[] }): React.ReactElement {
  return (
    <ul className="pt-list">
      {items.map((item, i) => (
        <ItemView key={i} item={item} />
      ))}
    </ul>
  );
}

function GroupView({ group: g }: { group: Group }): React.ReactElement {
  if (g.kind === "notices")
    return (
      <Card variant="orange" padding={3}>
        <VStack gap={1}>
          {g.texts.map((t, i) => (
            <Text key={i} size="sm">
              ※ {t}
            </Text>
          ))}
        </VStack>
      </Card>
    );
  if (g.kind === "facts")
    return (
      <dl className="pt-facts">
        {g.facts.map(f => (
          <div key={f.label}>
            <dt>
              <Text type="supporting">{f.label}</Text>
            </dt>
            <dd>
              <Text weight="semibold">{f.items[0].kind === "text" ? f.items[0].text : ""}</Text>
            </dd>
          </div>
        ))}
      </dl>
    );
  const { block } = g;
  if (block.kind === "field")
    return (
      <VStack gap={1}>
        <Text weight="bold" color="accent">
          {block.label}
        </Text>
        {block.items.length > 0 ? <Items items={block.items} /> : <Text type="supporting">내용 없음</Text>}
      </VStack>
    );
  return block.kind === "text" ? <Items items={block.items} /> : <Text>{block.text}</Text>;
}

/** HY-WEP's free-form text laid out as notices, key-value facts and labelled lists (see lib/posting-text.ts). */
export function PostingText({ text }: { text: string }): React.ReactElement {
  const groups = group(parsePostingText(text));
  if (groups.length === 0) return <Text type="supporting">원문에 내용이 없습니다.</Text>;
  return (
    <VStack gap={3}>
      {groups.map((g, i) => (
        <GroupView key={i} group={g} />
      ))}
    </VStack>
  );
}
