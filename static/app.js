/* =========================================================
   Agentic Loop - Frontend Orchestrator (app.js)
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("agent-form");
    const topicInput = document.getElementById("topic-input");
    const runBtn = document.getElementById("run-btn");
    const chipBtns = document.querySelectorAll(".chip-btn");

    const loadingContainer = document.getElementById("loading-container");
    const loadingStatusText = document.getElementById("loading-status-text");
    const loadingSubtext = document.getElementById("loading-subtext");

    const resultsWrapper = document.getElementById("results-wrapper");
    const resultTopicHeading = document.getElementById("result-topic-heading");
    const finalDraftContent = document.getElementById("final-draft-content");
    const decisionBadge = document.getElementById("decision-badge");
    const revisionCountText = document.getElementById("revision-count-text");
    const totalStepsText = document.getElementById("total-steps-text");
    const timelineContainer = document.getElementById("timeline-container");

    const copyBtn = document.getElementById("copy-btn");
    const copyBtnText = document.getElementById("copy-btn-text");
    const toast = document.getElementById("toast");

    // Node elements for workflow animation
    const nodeWriter = document.getElementById("step-node-writer");
    const nodeReviewer = document.getElementById("step-node-reviewer");
    const nodeReviser = document.getElementById("step-node-reviser");

    // Suggestion chips
    chipBtns.forEach(chip => {
        chip.addEventListener("click", () => {
            const topic = chip.getAttribute("data-topic");
            topicInput.value = topic;
            topicInput.focus();
        });
    });

    // Copy to clipboard
    copyBtn.addEventListener("click", async () => {
        const textToCopy = finalDraftContent.innerText;
        if (!textToCopy) return;

        try {
            await navigator.clipboard.writeText(textToCopy);
            copyBtnText.textContent = "Copied!";
            showToast("Draft copied to clipboard!");
            setTimeout(() => {
                copyBtnText.textContent = "Copy";
            }, 2000);
        } catch (err) {
            showToast("Failed to copy to clipboard", true);
        }
    });

    // Form submit
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const topic = topicInput.value.trim();
        if (!topic) return;

        // Set Loading UI
        setLoading(true, topic);

        try {
            const response = await fetch("/api/generate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ topic })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ detail: "Request failed" }));
                throw new Error(errData.detail || "Error generating response");
            }

            const data = await response.json();
            renderResults(data);
        } catch (err) {
            console.error("Agent error:", err);
            showToast(err.message || "An error occurred while running the agent loop", true);
        } finally {
            setLoading(false);
        }
    });

    function setLoading(isLoading, topic = "") {
        if (isLoading) {
            runBtn.disabled = true;
            runBtn.querySelector(".btn-text").textContent = "Running Loop...";
            loadingContainer.classList.remove("hidden");
            resultsWrapper.classList.add("hidden");

            // Animation sequence for agent steps
            animateWorkflow(true);
            loadingStatusText.textContent = `Processing '${topic}'...`;
            loadingSubtext.textContent = "Writer agent is drafting, Reviewer is preparing critique...";
        } else {
            runBtn.disabled = false;
            runBtn.querySelector(".btn-text").textContent = "Run Agent Loop";
            loadingContainer.classList.add("hidden");
            animateWorkflow(false);
        }
    }

    let animationInterval = null;
    function animateWorkflow(start) {
        if (start) {
            const nodes = [nodeWriter, nodeReviewer, nodeReviser];
            let activeIdx = 0;
            nodes.forEach(n => n.classList.remove("active"));
            nodes[0].classList.add("active");

            animationInterval = setInterval(() => {
                nodes.forEach(n => n.classList.remove("active"));
                activeIdx = (activeIdx + 1) % nodes.length;
                nodes[activeIdx].classList.add("active");
            }, 1200);
        } else {
            if (animationInterval) clearInterval(animationInterval);
            [nodeWriter, nodeReviewer, nodeReviser].forEach(n => n.classList.remove("active"));
        }
    }

    function renderResults(data) {
        const { topic, final_state, steps } = data;

        resultTopicHeading.textContent = topic;
        finalDraftContent.innerHTML = formatMarkdown(final_state.draft || "No draft generated.");

        // Decision Badge
        const decision = final_state.decision || "PASS";
        decisionBadge.textContent = decision;
        decisionBadge.className = `badge ${decision === "PASS" ? "badge-pass" : "badge-revise"}`;

        // Stats
        revisionCountText.textContent = final_state.revision_count ?? 0;
        totalStepsText.textContent = steps ? steps.length : 1;

        // Render Step Timeline
        timelineContainer.innerHTML = "";
        if (steps && steps.length > 0) {
            steps.forEach((step, index) => {
                const item = createTimelineItem(step, index + 1);
                timelineContainer.appendChild(item);
            });
        }

        resultsWrapper.classList.remove("hidden");
        resultsWrapper.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function createTimelineItem(step, stepNum) {
        const div = document.createElement("div");
        div.className = "timeline-item";

        const node = step.node;
        const output = step.output || {};

        let markerClass = "";
        let agentTitle = "";
        let agentIcon = "";
        let detailsHtml = "";

        if (node === "writer") {
            agentIcon = "✍️";
            agentTitle = `Step ${stepNum}: Writer Generated Initial Draft`;
            detailsHtml = `
                <div class="timeline-content">${formatMarkdown(output.draft || "")}</div>
            `;
        } else if (node === "reviewer") {
            const dec = output.decision || "PASS";
            agentIcon = "🔍";
            agentTitle = `Step ${stepNum}: Reviewer Evaluated Answer (${dec})`;
            markerClass = dec === "PASS" ? "reviewer-pass" : "reviewer-revise";

            detailsHtml = `
                <div class="timeline-content">
                    <strong>Decision:</strong> 
                    <span class="badge ${dec === 'PASS' ? 'badge-pass' : 'badge-revise'}" style="font-size:0.75rem; padding:0.15rem 0.5rem; margin-left:0.35rem;">
                        ${dec}
                    </span>
                    ${output.feedback ? `<div class="feedback-box"><strong>Feedback:</strong> ${output.feedback}</div>` : `<div style="margin-top:0.4rem; color:#34d399; font-size:0.85rem;">All beginner clarity rules satisfied!</div>`}
                </div>
            `;
        } else if (node === "reviser") {
            agentIcon = "🔄";
            agentTitle = `Step ${stepNum}: Reviser Updated Draft (Revision #${output.revision_count || 1})`;
            detailsHtml = `
                <div class="timeline-content">${formatMarkdown(output.draft || "")}</div>
            `;
        } else {
            agentIcon = "⚙️";
            agentTitle = `Step ${stepNum}: ${node}`;
            detailsHtml = `<div class="timeline-content"><pre>${JSON.stringify(output, null, 2)}</pre></div>`;
        }

        div.innerHTML = `
            <div class="timeline-marker ${markerClass}"></div>
            <div class="timeline-item-header">
                <span class="timeline-agent-title">${agentIcon} ${agentTitle}</span>
            </div>
            ${detailsHtml}
        `;

        return div;
    }

    // Basic markdown formatter for cleaner typography
    function formatMarkdown(text) {
        if (!text) return "";
        let html = text
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.*?)\*/g, "<em>$1</em>")
            .replace(/\n\n/g, "<br><br>")
            .replace(/\n/g, "<br>");
        return html;
    }

    function showToast(message, isError = false) {
        toast.textContent = message;
        toast.style.borderColor = isError ? "var(--danger)" : "var(--primary)";
        toast.classList.remove("hidden");

        setTimeout(() => {
            toast.classList.add("hidden");
        }, 4000);
    }
});
