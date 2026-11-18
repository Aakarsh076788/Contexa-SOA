/**
 * Context-to-Prompt Synthesis Engine for Contexa.
 * Converts multi-application workflow context and activity history into
 * structured, high-context prompts optimized for LLMs (ChatGPT, Gemini, Claude).
 */

export function synthesizePrompt(context, { entities = [], events = [], templateType = 'continue' } = {}) {
  const name = context.name || 'Unnamed Context';
  const topic = context.topic || 'General Development';
  const state = context.state || 'IMPLEMENTATION';
  const description = context.description || 'No description provided.';
  const note = context.sessionNote || '';
  const nextAction = context.nextAction || 'Continue work on this context.';

  // 1. Group entities by source
  const codeFiles = entities.filter(e => e.source === 'vscode' || e.type === 'file');
  const webResearch = entities.filter(e => e.source === 'chrome' || e.type === 'webpage');
  const conversations = entities.filter(e => e.source === 'discord' || e.source === 'github');

  // 2. Extract recent activity trail (up to 8 most recent events)
  const recentEvents = [...events]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8)
    .map(ev => `- [${ev.source.toUpperCase()}] ${ev.title}${ev.detail ? ` (${ev.detail})` : ''}`);

  // 3. Extract potential error/warning signals from events
  const errorEvents = events.filter(ev => 
    /error|fail|exception|bug|404|500|reject|crash/i.test(`${ev.title} ${ev.detail || ''}`)
  );

  let prompt = '';

  if (templateType === 'debug') {
    prompt = `### Role & Objective
You are an expert software engineer and debugger assisting me with a technical roadblock in my project.

### Active Work Context
- **Feature / Task**: ${name}
- **Topic Domain**: ${topic}
- **Current State**: ${state}
- **Task Summary**: ${description}

${note ? `### Developer's Session Note\n"${note}"\n` : ''}
### Relevant Files & Code Touchpoints
${codeFiles.length > 0 ? codeFiles.map(f => `- \`${f.label}\`${f.href ? ` (${f.href})` : ''}`).join('\n') : '- No specific files recorded yet.'}

### Research & Documentation Consulted
${webResearch.length > 0 ? webResearch.map(w => `- [${w.label}](${w.href || '#'})`).join('\n') : '- No web references recorded.'}

### Recent Activity & Errors Encountered
${errorEvents.length > 0 ? errorEvents.map(e => `- ⚠️ **${e.title}**: ${e.detail || 'Error signal detected'}`).join('\n') : '- No explicit error logs detected in event stream.'}

### Recent Workflow Sequence
${recentEvents.length > 0 ? recentEvents.join('\n') : '- No recorded sequence.'}

---
### My Request
Based on the exact context, files, and recent error signals above, please:
1. Identify the most likely root causes of this issue.
2. Provide step-by-step troubleshooting recommendations.
3. Write the exact corrected code snippets for the files involved.`;

  } else if (templateType === 'review') {
    prompt = `### Role & Objective
You are a senior tech lead conducting an architectural and code review for work in progress.

### Work Context Overview
- **Project Feature**: ${name}
- **Core Domain**: ${topic}
- **Lifecycle Stage**: ${state}
- **Summary**: ${description}

### Modified Code Artifacts & Files
${codeFiles.length > 0 ? codeFiles.map(f => `- \`${f.label}\``).join('\n') : '- None recorded.'}

### External Dependencies & References
${webResearch.length > 0 ? webResearch.map(w => `- ${w.label} (${w.href || 'URL'})`).join('\n') : '- None recorded.'}

${conversations.length > 0 ? `### Team Discussions & Pull Requests\n${conversations.map(c => `- ${c.label}`).join('\n')}\n` : ''}
### Workflow Progression
${recentEvents.length > 0 ? recentEvents.join('\n') : '- None recorded.'}

---
### My Request
Please review this development flow and provide feedback on:
1. Architectural soundness and separation of concerns.
2. Potential security, concurrency, or performance edge cases.
3. Missing unit or integration test cases I should add before merging.`;

  } else {
    // Default: 'continue' (Continue My Work)
    prompt = `### Context for LLM Assistance
I am working on **${name}** (Domain: \`${topic}\`).

### Where I Am Right Now
- **Lifecycle Status**: ${state}
- **Goal / Summary**: ${description}
- **Next Planned Action**: ${nextAction}

${note ? `### Notes From My Last Session\n> ${note}\n` : ''}
### Work Artifacts
- **Files Touched**: ${codeFiles.length > 0 ? codeFiles.map(f => `\`${f.label}\``).join(', ') : 'None'}
- **Docs & Research Consulted**: ${webResearch.length > 0 ? webResearch.map(w => w.label).join('; ') : 'None'}

### Recent Action Trail
${recentEvents.length > 0 ? recentEvents.join('\n') : '- Work in progress.'}

---
### Instructions for LLM
Please pick up where I left off:
1. Acknowledge the current progress and goal.
2. Guide me through implementing the next step (**${nextAction}**).
3. Provide the necessary code and commands.`;
  }

  return {
    templateType,
    contextId: context.id,
    contextName: name,
    prompt: prompt.trim(),
    metadata: {
      filesCount: codeFiles.length,
      researchCount: webResearch.length,
      eventsCount: events.length,
      characterCount: prompt.length,
      estimatedTokens: Math.round(prompt.length / 4)
    }
  };
}
