'use client';

import { useEffect, useState } from 'react';
import {
    Box,
    Card,
    CardBody,
    VStack,
    Text,
    Heading,
    Spinner,
    Button,
    Alert,
    AlertIcon,
} from '@chakra-ui/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle } from 'lucide-react';
import api from '@/utils/api';

export default function VerifyEmailPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    const [status, setStatus] = useState('verifying'); // verifying, success, error
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setMessage('Invalid verification link');
            return;
        }

        verifyEmail();
    }, [token]);

    const verifyEmail = async () => {
        try {
            await api.get(`/api/auth/verify-email/${token}`);
            setStatus('success');
            setMessage('Your email has been verified successfully!');
        } catch (error) {
            setStatus('error');
            setMessage(error.response?.data?.error || 'Verification failed');
        }
    };

    return (
        <Box
            minH="100vh"
            display="flex"
            alignItems="center"
            justifyContent="center"
            bg="gray.50"
        >
            <Card maxW="md" w="full" mx={4}>
                <CardBody>
                    <VStack spacing={6}>
                        {status === 'verifying' && (
                            <>
                                <Spinner size="xl" color="blue.500" />
                                <Heading size="md">Verifying your email...</Heading>
                            </>
                        )}

                        {status === 'success' && (
                            <>
                                <CheckCircle size={64} color="#48BB78" />
                                <Heading size="md" color="green.600">
                                    Email Verified!
                                </Heading>
                                <Text color="gray.600" textAlign="center">
                                    {message}
                                </Text>
                                <Button
                                    colorScheme="blue"
                                    onClick={() => router.push('/login')}
                                >
                                    Go to Login
                                </Button>
                            </>
                        )}

                        {status === 'error' && (
                            <>
                                <XCircle size={64} color="#E53E3E" />
                                <Heading size="md" color="red.600">
                                    Verification Failed
                                </Heading>
                                <Text color="gray.600" textAlign="center">
                                    {message}
                                </Text>
                                <Button
                                    colorScheme="blue"
                                    onClick={() => router.push('/login')}
                                >
                                    Go to Login
                                </Button>
                            </>
                        )}
                    </VStack>
                </CardBody>
            </Card>
        </Box>
    );
}