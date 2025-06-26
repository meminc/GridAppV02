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
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const { login } = useAuth();
    const router = useRouter();
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm();

    const onSubmit = async (data) => {
        setError('');
        setLoading(true);

        const result = await login(data.email, data.password);

        if (!result.success) {
            setError(result.error);
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
                                Grid Monitor
                            </Heading>
                            <Text color="gray.600" mt={2}>
                                Sign in to your account
                            </Text>
                        </Box>

                        {error && (
                            <Alert status="error" borderRadius="md">
                                <AlertIcon />
                                {error}
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

                                <FormControl isInvalid={errors.password}>
                                    <FormLabel>Password</FormLabel>
                                    <Input
                                        type="password"
                                        {...register('password', {
                                            required: 'Password is required',
                                        })}
                                    />
                                    {errors.password && (
                                        <Text color="red.500" fontSize="sm" mt={1}>
                                            {errors.password.message}
                                        </Text>
                                    )}
                                </FormControl>

                                <Button
                                    type="submit"
                                    colorScheme="blue"
                                    w="full"
                                    isLoading={loading}
                                >
                                    Sign In
                                </Button>
                            </VStack>
                        </form>

                        <Text fontSize="sm" color="gray.600">
                            Don't have an account?{' '}
                            <Link color="blue.600" onClick={() => router.push('/register')}>
                                Sign up
                            </Link>
                        </Text>
                    </VStack>
                </CardBody>
            </Card>
        </Box>
    );
}