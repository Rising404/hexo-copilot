import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full bg-gray-800 border border-red-500/50 rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-4xl">⚠️</span>
              <div>
                <h2 className="text-xl font-bold text-red-400">应用遇到错误</h2>
                <p className="text-gray-400 text-sm mt-1">
                  页面渲染时发生了意外错误，可能是由于 Markdown 语法或其他问题导致
                </p>
              </div>
            </div>

            <div className="bg-gray-900/50 rounded p-4 font-mono text-sm">
              <div className="text-red-300 font-bold mb-2">错误信息：</div>
              <div className="text-gray-300">
                {this.state.error?.message || '未知错误'}
              </div>
            </div>

            {this.state.errorInfo && (
              <details className="bg-gray-900/50 rounded p-4">
                <summary className="cursor-pointer text-gray-400 hover:text-gray-300 text-sm">
                  查看详细堆栈信息
                </summary>
                <pre className="mt-2 text-xs text-gray-500 overflow-auto max-h-60">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
              >
                重新加载
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                刷新整个页面
              </button>
            </div>

            <div className="text-xs text-gray-500 pt-3 border-t border-gray-700">
              💡 提示：如果问题持续出现，请检查最近编辑的 Markdown 内容，尤其是数学公式、图片路径等特殊语法
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
