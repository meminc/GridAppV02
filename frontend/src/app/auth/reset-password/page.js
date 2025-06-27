'use client';

import { useState, useEffect } from 'react';
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
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/utils/api';

export default function ResetPasswordPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    const [status, setStatus] = useState({ type: '', message: '' });
    const [loading, setLoading] = useState(false);

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors },
    } = useForm();

    const newPassword = watch('newPassword');

    useEffect(() => {
        if (!token) {
            router.push('/auth/forgot-password');
        }
    }, [token, router]);

    const onSubmit = async (data) => {
        setStatus({ type: '', message: '' });
        setLoading(true);

        try {
            await api.post('/api/auth/reset-password', {
                token,
                newPassword: data.newPassword,
            });

            setStatus({
                type: 'success',
                message: 'Password reset successfully! Redirecting to login...',
            });

            setTimeout(() => {
                router.push('/login');
            }, 2000);
        } catch (error) {
            setStatus({
                type: 'error',
                message: error.response?.data?.error || 'Invalid or expired reset token',
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
                                Reset Password
                            </Heading>
                            <Text color="gray.600" mt={2}>
                                Enter your new password
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
                                <FormControl isInvalid={errors.newPassword}>
                                    <FormLabel>New Password</FormLabel>
                                    <Input
                                        type="password"
                                        {...register('newPassword', {
                                            required: 'Password is required',
                                            minLength: {
                                                value: 8,
                                                message: 'Password must be at least 8 characters',
                                            },
                                            pattern: {
                                                value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                                                message: 'Password must contain uppercase, lowercase, and number',
                                            },
                                        })}
                                    />
                                    {errors.newPassword && (
                                        <Text color="red.500" fontSize="sm" mt={1}>
                                            {errors.newPassword.message}
                                        </Text>
                                    )}
                                </FormControl>

                                <FormControl isInvalid={errors.confirmPassword}>
                                    <FormLabel>Confirm Password</FormLabel>
                                    <Input
                                        type="password"
                                        {...register('confirmPassword', {
                                            required: 'Please confirm your password',
                                            validate: (value) =>
                                                value === newPassword || 'Passwords do not match',
                                        })}
                                    />
                                    {errors.confirmPassword && (
                                        <Text color="red.500" fontSize="sm" mt={1}>
                                            {errors.confirmPassword.message}
                                        </Text>
                                    )}
                                </FormControl>

                                <Button
                                    type="submit"
                                    colorScheme="blue"
                                    w="full"
                                    isLoading={loading}
                                >
                                    Reset Password
                                </Button>
                            </VStack>
                        </form>
                    </VStack>
                </CardBody>
            </Card>
        </Box>
    );
}