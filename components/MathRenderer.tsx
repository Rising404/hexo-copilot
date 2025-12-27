import React, { useEffect, useRef } from 'react';
import katex from 'katex';

interface MathRendererProps {
  value: string;
  display?: boolean;
}

/**
 * 数学公式渲染组件
 * - display: true 为块级公式（$$...$$）
 * - display: false 为行内公式（$...$）
 */
const MathRenderer: React.FC<MathRendererProps> = ({ value, display = false }) => {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    try {
      katex.render(value, containerRef.current, {
        displayMode: display,
        throwOnError: false,
        output: 'html', // 使用HTML输出，避免某些环境问题
      });
    } catch (error) {
      // KaTeX渲染失败时，显示原始内容
      if (containerRef.current) {
        containerRef.current.textContent = `$${display ? '$' : ''}${value}${display ? '$$' : '$'}`;
      }
      console.warn('KaTeX render error:', error);
    }
  }, [value, display]);

  return display ? (
    <div 
      ref={containerRef} 
      className="my-4 overflow-x-auto"
      style={{ 
        textAlign: 'center',
        padding: '1rem 0'
      }}
    />
  ) : (
    <span 
      ref={containerRef}
      style={{ 
        display: 'inline-block',
        marginRight: '0.2em'
      }}
    />
  );
};

export default MathRenderer;
