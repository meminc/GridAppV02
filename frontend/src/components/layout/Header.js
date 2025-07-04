import {
    Box,
    Flex,
    Text,
    Button,
    Menu,
    MenuButton,
    MenuList,
    MenuItem,
    Avatar,
    HStack,
    Badge,
} from '@chakra-ui/react';
import { ChevronDown, Bell, Settings } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function Header() {
    const { user, logout } = useAuth();

    return (
        <Box bg="white" shadow="sm" px={6} py={3}>
            <Flex justify="space-between" align="center">
                <HStack spacing={4}>
                    <Text fontSize="xl" fontWeight="bold" color="blue.600">
                        Grid Monitor
                    </Text>
                    <Badge colorScheme="green">ONLINE</Badge>
                </HStack>

                <HStack spacing={4}>
                    <Button leftIcon={<Bell size={20} />} variant="ghost" position="relative">
                        <Box
                            position="absolute"
                            top="8px"
                            right="8px"
                            w="8px"
                            h="8px"
                            bg="red.500"
                            borderRadius="full"
                        />
                    </Button>

                    <Button as={Button} variant="ghost" />

                    <Menu>
                        <MenuButton as={Button} variant="ghost">
                            <HStack spacing={2}>
                                <Avatar size="sm" name={user?.firstName + ' ' + user?.lastName} />
                                <Text fontSize="sm">{user?.firstName}</Text>
                                <ChevronDown size={16} />
                            </HStack>
                        </MenuButton>
                        <MenuList>
                            <MenuItem>Profile</MenuItem>
                            <MenuItem>Settings</MenuItem>
                            <MenuItem onClick={logout}>Logout</MenuItem>
                        </MenuList>
                    </Menu>
                </HStack>
            </Flex>
        </Box>
    );
}