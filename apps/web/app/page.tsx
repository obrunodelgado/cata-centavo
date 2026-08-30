import { localDayOf } from "@cata-centavo/core";

export default function Index() {
  const date = localDayOf(new Date().toISOString());

  return (
    <main>
      <h1>cata-centavo</h1>
      <p>Today in S&#xE3;o Paulo: {date}</p>
    </main>
  );
}
