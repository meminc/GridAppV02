'use client';

import { useEffect } from 'react';
import { Box, Heading, HStack, Text } from '@chakra-ui/react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import NetworkViewer from '@/components/network/NetworkViewer';
import NetworkStats from '@/components/network/NetworkStats';

export default function NetworkPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);

    if (loading || !user) return null;

    return (
        <MainLayout>
            <Box h="calc(100vh - 64px)" display="flex" flexDirection="column">
                <HStack p={4} borderBottom="1px" borderColor="gray.200">
                    <Box>
                        <Heading size="lg">Network Topology</Heading>
                        <Text color="gray.600">Real-time grid monitoring and visualization</Text>
                    </Box>
                    <Box flex="1" />
                    <NetworkStats />
                </HStack>

                <Box flex="1" p={4}>
                    <NetworkViewer />
                </Box>
            </Box>
        </MainLayout>
    );
}