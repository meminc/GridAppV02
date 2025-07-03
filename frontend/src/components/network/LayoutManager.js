'use client';

import { useState, useEffect } from 'react';
import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalFooter,
    ModalBody,
    ModalCloseButton,
    Button,
    FormControl,
    FormLabel,
    Input,
    Textarea,
    VStack,
    HStack,
    List,
    ListItem,
    Text,
    Badge,
    IconButton,
    useToast,
    Divider,
} from '@chakra-ui/react';
import { Save, Download, Trash2 } from 'lucide-react';
import api from '@/utils/api';

export default function LayoutManager({ isOpen, onClose, currentLayout, onLoadLayout }) {
    const [layouts, setLayouts] = useState([]);
    const [saving, setSaving] = useState(false);
    const [layoutName, setLayoutName] = useState('');
    const [layoutDescription, setLayoutDescription] = useState('');
    const toast = useToast();

    useEffect(() => {
        if (isOpen) {
            loadLayouts();
        }
    }, [isOpen]);

    const loadLayouts = async () => {
        try {
            const response = await api.get('/api/topology/layouts');
            setLayouts(response.data.layouts);
        } catch (error) {
            toast({
                title: 'Failed to load layouts',
                status: 'error',
                duration: 3000,
            });
        }
    };

    const saveLayout = async () => {
        if (!layoutName) {
            toast({
                title: 'Please enter a layout name',
                status: 'warning',
                duration: 3000,
            });
            return;
        }

        setSaving(true);
        try {
            await api.post('/api/topology/layout', {
                name: layoutName,
                description: layoutDescription,
                layout: currentLayout,
            });

            toast({
                title: 'Layout saved successfully',
                status: 'success',
                duration: 3000,
            });

            setLayoutName('');
            setLayoutDescription('');
            loadLayouts();
        } catch (error) {
            toast({
                title: 'Failed to save layout',
                description: error.response?.data?.error || 'An error occurred',
                status: 'error',
                duration: 5000,
            });
        } finally {
            setSaving(false);
        }
    };

    const deleteLayout = async (layoutId) => {
        try {
            await api.delete(`/api/topology/layouts/${layoutId}`);
            toast({
                title: 'Layout deleted',
                status: 'success',
                duration: 3000,
            });
            loadLayouts();
        } catch (error) {
            toast({
                title: 'Failed to delete layout',
                status: 'error',
                duration: 3000,
            });
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="xl">
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>Layout Manager</ModalHeader>
                <ModalCloseButton />

                <ModalBody>
                    <VStack align="stretch" spacing={4}>
                        {/* Save New Layout */}
                        <VStack align="stretch" spacing={3}>
                            <Text fontWeight="bold">Save Current Layout</Text>
                            <FormControl>
                                <FormLabel>Layout Name</FormLabel>
                                <Input
                                    value={layoutName}
                                    onChange={(e) => setLayoutName(e.target.value)}
                                    placeholder="Enter layout name"
                                />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Description (Optional)</FormLabel>
                                <Textarea
                                    value={layoutDescription}
                                    onChange={(e) => setLayoutDescription(e.target.value)}
                                    placeholder="Enter layout description"
                                    rows={2}
                                />
                            </FormControl>
                            <Button
                                leftIcon={<Save size={18} />}
                                colorScheme="blue"
                                onClick={saveLayout}
                                isLoading={saving}
                                alignSelf="flex-start"
                            >
                                Save Layout
                            </Button>
                        </VStack>

                        <Divider />

                        {/* Saved Layouts */}
                        <VStack align="stretch" spacing={3}>
                            <Text fontWeight="bold">Saved Layouts</Text>
                            <List spacing={2} maxH="300px" overflowY="auto">
                                {layouts.length > 0 ? (
                                    layouts.map((layout) => (
                                        <ListItem
                                            key={layout.id}
                                            p={3}
                                            borderWidth={1}
                                            borderRadius="md"
                                            _hover={{ bg: 'gray.50' }}
                                        >
                                            <HStack justify="space-between">
                                                <VStack align="start" spacing={1}>
                                                    <HStack>
                                                        <Text fontWeight="medium">{layout.name}</Text>
                                                        <Badge size="sm" colorScheme="gray">
                                                            {new Date(layout.created_at).toLocaleDateString()}
                                                        </Badge>
                                                    </HStack>
                                                    {layout.description && (
                                                        <Text fontSize="sm" color="gray.600">
                                                            {layout.description}
                                                        </Text>
                                                    )}
                                                    <Text fontSize="xs" color="gray.500">
                                                        By {layout.first_name} {layout.last_name}
                                                    </Text>
                                                </VStack>
                                                <HStack>
                                                    <IconButton
                                                        size="sm"
                                                        icon={<Download size={16} />}
                                                        onClick={() => {
                                                            onLoadLayout(JSON.parse(layout.layout_data));
                                                            onClose();
                                                        }}
                                                        aria-label="Load layout"
                                                    />
                                                    <IconButton
                                                        size="sm"
                                                        icon={<Trash2 size={16} />}
                                                        colorScheme="red"
                                                        variant="ghost"
                                                        onClick={() => deleteLayout(layout.id)}
                                                        aria-label="Delete layout"
                                                    />
                                                </HStack>
                                            </HStack>
                                        </ListItem>
                                    ))
                                ) : (
                                    <Text color="gray.500" textAlign="center" py={4}>
                                        No saved layouts
                                    </Text>
                                )}
                            </List>
                        </VStack>
                    </VStack>
                </ModalBody>

                <ModalFooter>
                    <Button onClick={onClose}>Close</Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}