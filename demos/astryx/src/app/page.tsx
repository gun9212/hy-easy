import { samplePostings, DEMO_NOW } from "@lib/sample";
import { PostingsApp } from "@demo/components/postings-app";

export default function Page(): React.ReactElement {
  return <PostingsApp postings={samplePostings} now={DEMO_NOW} />;
}
