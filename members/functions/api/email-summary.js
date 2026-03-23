export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();

    const {
      email,
      note,
      language,
      visitedAt,
      assessments = {},
      tools = {},
      reflection = {},
      page
    } = body || {};

    if (!email || typeof email !== "string") {
      return json({ error: "Missing email" }, 400);
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      return json({ error: "Invalid email address" }, 400);
    }

    const assessmentItems = Object.values(assessments);
    const toolItems = Object.values(tools).filter((item) => {
      if (!item) return false;
      if (item.completed) return true;
      if (typeof item.content === "string" && item.content.trim()) return true;
      if (Array.isArray(item.entries) && item.entries.some((e) => e?.value?.trim())) return true;
      return false;
    });

    if (assessmentItems.length === 0 && toolItems.length === 0) {
      return json({ error: "Nothing to send" }, 400);
    }

    const isRo = language === "ro";
    const subject = isRo
      ? "Rezumatul tău Grundimpuls Members Hub"
      : "Your Grundimpuls Members Hub summary";

    const html = buildHtml({
      email,
      note,
      visitedAt,
      page,
      assessmentItems,
      toolItems,
      isRo
    });

    const text = buildText({
      email,
      note,
      visitedAt,
      page,
      assessmentItems,
      toolItems,
      isRo
    });

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Grundimpuls Members Hub <members@grundimpuls.com>",
        to: [email],
        subject,
        html,
        text
      })
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      return json(
        { error: resendData?.message || "Failed to send email" },
        500
      );
    }

    return json({ ok: true, resend: resendData }, 200);
  } catch (error) {
    return json({ error: error.message || "Unexpected error" }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildHtml({
  note,
  visitedAt,
  page,
  assessmentItems,
  toolItems,
  isRo
}) {
  const assessmentsHtml = assessmentItems.length
    ? assessmentItems.map((item) => `
      <li style="margin-bottom:12px;">
        <strong>${esc(item.title)}</strong><br>
        ${isRo ? "Scor" : "Score"}: ${esc(item.scoreText)}<br>
        ${isRo ? "Rezultat" : "Result"}: ${esc(item.label)}<br>
        <span style="color:#555;">${esc(item.description)}</span>
      </li>
    `).join("")
    : `<p>${isRo ? "Nicio evaluare completată." : "No assessments completed."}</p>`;

  const toolsHtml = toolItems.length
    ? toolItems.map((item) => {
        let content = "";

        if (typeof item.content === "string" && item.content.trim()) {
          content = `<pre style="white-space:pre-wrap;font-family:inherit;">${esc(item.content)}</pre>`;
        } else if (Array.isArray(item.entries)) {
          const rows = item.entries
            .filter((e) => e?.value?.trim())
            .map((e) => `<li><strong>${esc(e.label)}:</strong> ${esc(e.value)}</li>`)
            .join("");
          content = rows ? `<ul>${rows}</ul>` : "";
        } else if (item.completed) {
          content = `<p>${isRo ? "Finalizat în această vizită." : "Completed during this visit."}</p>`;
        }

        return `
          <li style="margin-bottom:16px;">
            <strong>${esc(item.label || "")}</strong>
            ${content}
          </li>
        `;
      }).join("")
    : `<p>${isRo ? "Niciun instrument folosit." : "No tools used."}</p>`;

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#1f2937;">
      <h2>Grundimpuls Members Hub</h2>
      <p>${isRo ? "Rezumatul vizitei tale." : "Summary of your visit."}</p>

      ${note ? `
        <div style="padding:12px 14px;border:1px solid #d5e1ee;border-radius:12px;background:#f4f8fc;">
          <strong>${isRo ? "Notă" : "Note"}:</strong><br>
          ${esc(note)}
        </div>
      ` : ""}

      <p style="margin-top:16px;">
        <strong>${isRo ? "Dată" : "Date"}:</strong> ${esc(visitedAt || "")}<br>
        <strong>${isRo ? "Pagină" : "Page"}:</strong> ${esc(page || "")}
      </p>

      <h3>${isRo ? "Evaluări" : "Assessments"}</h3>
      <ul>${assessmentsHtml}</ul>

      <h3>${isRo ? "Instrumente" : "Tools"}</h3>
      <ul>${toolsHtml}</ul>

      <p style="margin-top:24px;color:#64748b;">
        ${isRo
          ? "Poți aduce acest rezumat la următoarea sesiune de coaching sau training."
          : "You can bring this summary to your next coaching or training session."}
      </p>
    </div>
  `;
}

function buildText({
  note,
  visitedAt,
  page,
  assessmentItems,
  toolItems,
  isRo
}) {
  const assessmentsText = assessmentItems.length
    ? assessmentItems.map((item) =>
        `- ${item.title}\n  ${isRo ? "Scor" : "Score"}: ${item.scoreText}\n  ${isRo ? "Rezultat" : "Result"}: ${item.label}\n  ${item.description}`
      ).join("\n\n")
    : (isRo ? "Nicio evaluare completată." : "No assessments completed.");

  const toolsText = toolItems.length
    ? toolItems.map((item) => {
        let content = "";
        if (typeof item.content === "string" && item.content.trim()) {
          content = item.content;
        } else if (Array.isArray(item.entries)) {
          content = item.entries
            .filter((e) => e?.value?.trim())
            .map((e) => `  - ${e.label}: ${e.value}`)
            .join("\n");
        } else if (item.completed) {
          content = isRo ? "Finalizat în această vizită." : "Completed during this visit.";
        }
        return `- ${item.label || ""}\n${content}`;
      }).join("\n\n")
    : (isRo ? "Niciun instrument folosit." : "No tools used.");

  return [
    "Grundimpuls Members Hub",
    "",
    isRo ? "Rezumatul vizitei tale." : "Summary of your visit.",
    "",
    note ? `${isRo ? "Notă" : "Note"}: ${note}\n` : "",
    `${isRo ? "Dată" : "Date"}: ${visitedAt || ""}`,
    `${isRo ? "Pagină" : "Page"}: ${page || ""}`,
    "",
    `${isRo ? "Evaluări" : "Assessments"}:`,
    assessmentsText,
    "",
    `${isRo ? "Instrumente" : "Tools"}:`,
    toolsText,
    "",
    isRo
      ? "Poți aduce acest rezumat la următoarea sesiune de coaching sau training."
      : "You can bring this summary to your next coaching or training session."
  ].join("\n");
}
