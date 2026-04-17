import { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			// Robust connection retry logic with exponential backoff
			retry: (failureCount, error) => {
				if (failureCount >= 3) return false;
				// Log connection failures for monitoring
				console.error(`[DB Connection Attempt ${failureCount + 1}] Failed:`, error.message);
				return true;
			},
			retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
			staleTime: 5 * 60 * 1000,
		},
		mutations: {
			onError: (error) => {
				// Global error handling for data persistence
				console.error('[Data Persistence Error]:', error);
				toast.error(`Database Error: ${error.message || 'Failed to save record'}`);
			},
			onSuccess: (data, variables, context) => {
				// Global logging for successful data flow monitoring
				console.log('[Data Flow Success]: Record processed successfully', {
					timestamp: new Date().toISOString(),
					type: context?.mutationKey?.[0] || 'Unknown'
				});
			}
		}
	},
});