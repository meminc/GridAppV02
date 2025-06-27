'use client';

import { useState, useEffect } from 'react';
import {
    Box,
    Card,
    CardBody,
    Heading,
    VStack,
    HStack,
    Text,
    Button,
    FormControl,
    FormLabel,
    Input,
    Alert,
    AlertIcon,
    Badge,
    Divider,
    useToast,
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { User, Mail, Shield, Clock, AlertCircle } from 'lucide-react';
import api from '@/utils/api';

export default function ProfilePage() {
    const { user, checkAuth } = useAuth();
    const router = useRouter();
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);

    const {
        register: registerProfile,
        handleSubmit: handleProfileSubmit,
        setValue: setProfileValue,
        formState: { errors: profileErrors },
    } = useForm();

    const {
        register: registerPassword,
        handleSubmit: handlePasswordSubmit,
        reset: resetPassword,
        watch,
        formState: { errors: passwordErrors },
    } = useForm();

    const newPassword = watch('newPassword');

    useEffect(() => {
        if (!user) {
            router.push('/login');
            return;
        }

        // Set form values
        setProfileValue('firstName', user.firstName);
        setProfileValue('lastName', user.lastName);
        setProfileValue('email', user.email);
    }, [user, router, setProfileValue]);

    const onProfileSubmit = async (data) => {
        setLoading(true);
        try {
            await api.put('/api/users/profile', {
                firstName: data.firstName,
                lastName: data.lastName,
            });

            await checkAuth(); // Refresh user data

            toast({
                title: 'Profile updated',
                description: 'Your profile has been updated successfully.',
                status: 'success',
                duration: 5000,
                isClosable: true,
            });
        } catch (error) {
            toast({
                title: 'Update failed',
                description: error.response?.data?.error || 'Failed to update profile',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setLoading(false);
        }
    };

    const onPasswordSubmit = async (data) => {
        setPasswordLoading(true);
        try {
            await api.post('/api/auth/change-password', {
                currentPassword: data.currentPassword,
                newPassword: data.newPassword,
            });

            resetPassword();

            toast({
                title: 'Password changed',
                description: 'Your password has been changed successfully.',
                status: 'success',
                duration: 5000,
                isClosable: true,
            });
        } catch (error) {
            toast({
                title: 'Password change failed',
                description: error.response?.data?.error || 'Failed to change password',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setPasswordLoading(false);
        }
    };

    const resendVerification = async () => {
        try {
            await api.post('/api/auth/resend-verification');
            toast({
                title: 'Verification email sent',
                description: 'Please check your email for the verification link.',
                status: 'success',
                duration: 5000,
                isClosable: true,
            });
        } catch (error) {
            toast({
                title: 'Failed to send email',
                description: error.response?.data?.error || 'An error occurred',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        }
    };

    if (!user) return null;

    return (
        <MainLayout>
            <Box p={6}>
                <Heading size="lg" mb={6}>
                    Profile Settings
                </Heading>

                <VStack spacing={6} align="stretch" maxW="800px">
                    {/* Email Verification Alert */}
                    {!user.emailVerified && (
                        <Alert status="warning" borderRadius="md">
                            <AlertIcon />
                            <Box flex="1">
                                <Text fontWeight="bold">Email not verified</Text>
                                <Text fontSize="sm">
                                    Please verify your email address to access all features.
                                </Text>
                            </Box>
                            <Button size="sm" colorScheme="orange" onClick={resendVerification}>
                                Resend Email
                            </Button>
                        </Alert>
                    )}

                    {/* Profile Information */}
                    <Card>
                        <CardBody>
                            <VStack align="stretch" spacing={4}>
                                <HStack>
                                    <User size={24} />
                                    <Heading size="md">Profile Information</Heading>
                                </HStack>

                                <form onSubmit={handleProfileSubmit(onProfileSubmit)}>
                                    <VStack spacing={4}>
                                        <HStack spacing={4} w="full">
                                            <FormControl isInvalid={profileErrors.firstName}>
                                                <FormLabel>First Name</FormLabel>
                                                <Input
                                                    {...registerProfile('firstName', {
                                                        required: 'First name is required',
                                                    })}
                                                />
                                            </FormControl>

                                            <FormControl isInvalid={profileErrors.lastName}>
                                                <FormLabel>Last Name</FormLabel>
                                                <Input
                                                    {...registerProfile('lastName', {
                                                        required: 'Last name is required',
                                                    })}
                                                />
                                            </FormControl>
                                        </HStack>

                                        <FormControl isReadOnly>
                                            <FormLabel>Email</FormLabel>
                                            <HStack>
                                                <Input value={user.email} isReadOnly />
                                                {user.emailVerified ? (
                                                    <Badge colorScheme="green">Verified</Badge>
                                                ) : (
                                                    <Badge colorScheme="orange">Unverified</Badge>
                                                )}
                                            </HStack>
                                        </FormControl>

                                        <FormControl isReadOnly>
                                            <FormLabel>Role</FormLabel>
                                            <HStack>
                                                <Input value={user.role} isReadOnly />
                                                <Badge colorScheme="blue">{user.role}</Badge>
                                            </HStack>
                                        </FormControl>

                                        <Button
                                            type="submit"
                                            colorScheme="blue"
                                            isLoading={loading}
                                            alignSelf="flex-start"
                                        >
                                            Update Profile
                                        </Button>
                                    </VStack>
                                </form>
                            </VStack>
                        </CardBody>
                    </Card>

                    {/* Change Password */}
                    <Card>
                        <CardBody>
                            <VStack align="stretch" spacing={4}>
                                <HStack>
                                    <Shield size={24} />
                                    <Heading size="md">Change Password</Heading>
                                </HStack>

                                <form onSubmit={handlePasswordSubmit(onPasswordSubmit)}>
                                    <VStack spacing={4}>
                                        <FormControl isInvalid={passwordErrors.currentPassword}>
                                            <FormLabel>Current Password</FormLabel>
                                            <Input
                                                type="password"
                                                {...registerPassword('currentPassword', {
                                                    required: 'Current password is required',
                                                })}
                                            />
                                        </FormControl>

                                        <FormControl isInvalid={passwordErrors.newPassword}>
                                            <FormLabel>New Password</FormLabel>
                                            <Input
                                                type="password"
                                                {...registerPassword('newPassword', {
                                                    required: 'New password is required',
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
                                        </FormControl>

                                        <FormControl isInvalid={passwordErrors.confirmPassword}>
                                            <FormLabel>Confirm New Password</FormLabel>
                                            <Input
                                                type="password"
                                                {...registerPassword('confirmPassword', {
                                                    required: 'Please confirm your password',
                                                    validate: (value) =>
                                                        value === newPassword || 'Passwords do not match',
                                                })}
                                            />
                                        </FormControl>

                                        <Button
                                            type="submit"
                                            colorScheme="blue"
                                            isLoading={passwordLoading}
                                            alignSelf="flex-start"
                                        >
                                            Change Password
                                        </Button>
                                    </VStack>
                                </form>
                            </VStack>
                        </CardBody>
                    </Card>

                    {/* Account Information */}
                    <Card>
                        <CardBody>
                            <VStack align="stretch" spacing={4}>
                                <HStack>
                                    <Clock size={24} />
                                    <Heading size="md">Account Information</Heading>
                                </HStack>

                                <VStack align="stretch" spacing={2}>
                                    <HStack justify="space-between">
                                        <Text color="gray.600">Account Created</Text>
                                        <Text>
                                            {user.createdAt
                                                ? new Date(user.createdAt).toLocaleDateString()
                                                : 'N/A'}
                                        </Text>
                                    </HStack>

                                    <HStack justify="space-between">
                                        <Text color="gray.600">Last Login</Text>
                                        <Text>
                                            {user.lastLoginAt
                                                ? new Date(user.lastLoginAt).toLocaleString()
                                                : 'N/A'}
                                        </Text>
                                    </HStack>

                                    <HStack justify="space-between">
                                        <Text color="gray.600">Account Status</Text>
                                        <Badge colorScheme={user.isActive ? 'green' : 'red'}>
                                            {user.isActive ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </HStack>
                                </VStack>
                            </VStack>
                        </CardBody>
                    </Card>
                </VStack>
            </Box>
        </MainLayout>
    );
}