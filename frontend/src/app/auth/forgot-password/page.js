'use client';

import { useState } from 'react';
import {
    Box,
    Button,
    Card,
    CardBody,
    FormControl,
    FormLabel,
    Input,
    VStack,
    Text,
    Alert,
    AlertIcon,
    Heading,
    Link,
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import api from '@/utils/api';

export default function ForgotPasswordPage() {
    const router = useRouter();
    const [status, setStatus] = useState({ type: '', message: '' });
    const [loading, setLoading] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm();

    const onSubmit = async (data) => {
        setStatus({ type: '', message: '' });
        setLoading(true);

        try {
            await api.post('/api/auth/forgot-password', data);
            setStatus({
                type: 'success',
                message: 'If the email exists, a password reset link has been sent.',
            });
        } catch (error) {
            setStatus({
                type: 'error',
                message: error.response?.data?.error || 'An error occurred',
            });
        } finally {
            setLoading(false);
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
                        <Box textAlign="center">
                            <Heading size="lg" color="blue.600">
                                Forgot Password
                            </Heading>
                            <Text color="gray.600" mt={2}>
                                Enter your email to receive a reset link
                            </Text>
                        </Box>

                        {status.message && (
                            <Alert status={status.type} borderRadius="md">
                                <AlertIcon />
                                {status.message}
                            </Alert>
                        )}

                        <form onSubmit={handleSubmit(onSubmit)} style={{ width: '100%' }}>
                            <VStack spacing={4}>
                                <FormControl isInvalid={errors.email}>
                                    <FormLabel>Email</FormLabel>
                                    <Input
                                        type="email"
                                        {...register('email', {
                                            required: 'Email is required',
                                            pattern: {
                                                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                                                message: 'Invalid email address',
                                            },
                                        })}
                                    />
                                    {errors.email && (
                                        <Text color="red.500" fontSize="sm" mt={1}>
                                            {errors.email.message}
                                        </Text>
                                    )}
                                </FormControl>

                                <Button
                                    type="submit"
                                    colorScheme="blue"
                                    w="full"
                                    isLoading={loading}
                                >
                                    Send Reset Link
                                </Button>
                            </VStack>
                        </form>

                        <Text fontSize="sm" color="gray.600">
                            Remember your password?{' '}
                            <Link color="blue.600" onClick={() => router.push('/login')}>
                                Sign in
                            </Link>
                        </Text>
                    </VStack>
                </CardBody>
            </Card>
        </Box>
    );
}