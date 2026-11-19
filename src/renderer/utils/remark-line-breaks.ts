// Preserve soft line breaks in prose without modifying stored Markdown, code or tables.
interface Node { type: string; value?: string; children?: Node[] }
export default function remarkLineBreaks() {
  return (tree: Node): void => {
    function visit(node: Node): void {
      if (!node.children || ['code','inlineCode','html','table'].includes(node.type)) return
      node.children = node.children.flatMap(child => {
        if (child.type !== 'text' || !child.value?.includes('\n')) { visit(child); return [child] }
        return child.value.split(/\r\n?|\n/).flatMap((value, i) => i ? [{type:'break'}, {type:'text',value}] : [{type:'text',value}])
      })
    }
    visit(tree)
  }
}
