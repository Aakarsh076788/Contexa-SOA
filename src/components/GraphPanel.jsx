import { useState, useEffect, useRef } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';

export default function GraphPanel({ entities, relationships }) {
  const [selected, setSelected] = useState(relationships[0]);
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !entities.length) return;

    const nodes = entities.map(d => Object.create(d));
    const ids = new Set(entities.map(x => x.id));
    const links = relationships.filter(x => ids.has(x.from) && ids.has(x.to)).map(d => ({ ...d, source: d.from, target: d.to }));

    const width = 800;
    const height = 400;

    const simulation = forceSimulation(nodes)
      .force('link', forceLink(links).id(d => d.id).distance(100))
      .force('charge', forceManyBody().strength(-300))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide().radius(40));

    const svg = svgRef.current;
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.appendChild(g);

    const linkElements = [];
    const linkGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    linkGroup.setAttribute("class", "links");
    g.appendChild(linkGroup);

    for (let link of links) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("stroke", "var(--border-strong, #ccc)");
      line.setAttribute("stroke-width", "2");
      line.style.cursor = "pointer";
      line.onmouseenter = () => setSelected(relationships.find(r => r.from === link.source.id && r.to === link.target.id));
      line.onclick = () => setSelected(relationships.find(r => r.from === link.source.id && r.to === link.target.id));
      linkGroup.appendChild(line);
      linkElements.push({ data: link, node: line });
    }

    const nodeElements = [];
    const nodeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    nodeGroup.setAttribute("class", "nodes");
    g.appendChild(nodeGroup);

    for (let node of nodes) {
      const gNode = document.createElementNS("http://www.w3.org/2000/svg", "g");
      gNode.setAttribute("class", `graph-node-svg ${node.source}`);
      gNode.style.cursor = "pointer";
      
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", "20");
      let fill = "#888";
      if (node.source === "chrome") fill = "#4285F4";
      if (node.source === "vscode") fill = "#007ACC";
      if (node.source === "github") fill = "#333";
      if (node.source === "discord") fill = "#5865F2";
      circle.setAttribute("fill", fill);
      
      gNode.appendChild(circle);
      
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      const label = node.label || node.source;
      text.textContent = label.length > 36 ? `${label.slice(0, 33)}…` : label;
      text.setAttribute("dy", "35");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "var(--text-primary, #333)");
      text.style.fontSize = "12px";
      gNode.appendChild(text);

      gNode.onmouseenter = () => {
        const relation = relationships.find(edge => edge.from === node.id || edge.to === node.id);
        if (relation) setSelected(relation);
      };
      gNode.setAttribute('tabindex', '0');
      gNode.setAttribute('role', 'button');
      gNode.setAttribute('aria-label', node.label || node.source);
      gNode.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setSelected(relationships.find(edge => edge.from === node.id || edge.to === node.id));
        }
      };
      gNode.onpointerdown = event => {
        event.preventDefault();
        gNode.setPointerCapture(event.pointerId);
        simulation.alphaTarget(0.3).restart();
        node.fx = node.x; node.fy = node.y;
        gNode.onpointermove = move => {
          const point = svg.createSVGPoint(); point.x = move.clientX; point.y = move.clientY;
          const matrix = svg.getScreenCTM();
          if (!matrix) return;
          const local = point.matrixTransform(matrix.inverse());
          node.fx = Math.max(20, Math.min(width - 20, local.x));
          node.fy = Math.max(20, Math.min(height - 50, local.y));
        };
        const stopDrag = () => { simulation.alphaTarget(0); node.fx = null; node.fy = null; gNode.onpointermove = null; };
        gNode.onpointerup = stopDrag;
        gNode.onpointercancel = stopDrag;
      };

      nodeGroup.appendChild(gNode);
      nodeElements.push({ data: node, node: gNode });
    }

    simulation.on("tick", () => {
      for (let l of linkElements) {
        l.node.setAttribute("x1", l.data.source.x);
        l.node.setAttribute("y1", l.data.source.y);
        l.node.setAttribute("x2", l.data.target.x);
        l.node.setAttribute("y2", l.data.target.y);
      }
      for (let n of nodeElements) {
        n.data.x = Math.max(35, Math.min(width - 35, n.data.x));
        n.data.y = Math.max(25, Math.min(height - 50, n.data.y));
        n.node.setAttribute("transform", `translate(${n.data.x},${n.data.y})`);
      }
    });

    if (document.documentElement.dataset.motion === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { simulation.stop(); simulation.tick(200); simulation.on('tick')?.(); }
    return () => simulation.stop();
  }, [entities, relationships]);

  const entityById = (id) => entities.find((item) => item.id === id);

  return (
    <section className="graph-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">CONTEXT GRAPH</p>
          <h2>Connected work, explainable links</h2>
        </div>
        <span>{relationships.length} relationships</span>
      </div>
      <div className="graph-container" style={{ width: '100%', height: '400px', background: 'var(--bg-secondary, #f9f9f9)', borderRadius: '8px', overflow: 'hidden' }}>
        <svg ref={svgRef} width="100%" height="100%" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet"></svg>
      </div>
      <details><summary>Read graph connections</summary><ul>{relationships.map(edge => <li key={edge.id}>{entityById(edge.from)?.label || 'Unassigned resource'} → {entityById(edge.to)?.label || 'Unassigned resource'}: {edge.reason}</li>)}</ul></details>
      {selected && (
        <div className="graph-reason">
          <span>Why connected</span>
          <p><strong>{entityById(selected.from)?.label}</strong> → <strong>{entityById(selected.to)?.label}</strong></p>
          <small>{selected.reason} Matching score {selected.confidence}/100; not a probability.</small>
        </div>
      )}
    </section>
  );
}
